import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getJsonReadCacheStats,
  readJsonFileDetailed,
  resetJsonReadCacheStats,
  withJsonReadCache,
} from './lib/forge-io.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const TEMP_DIRS: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-io-cache-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
  resetJsonReadCacheStats();
});

describe('json read cache', () => {
  it('reuses repeated reads within a single cache scope', () => {
    const cwd = makeWorkspace();
    const target = join(cwd, '.forge', 'state.json');
    writeFileSync(target, JSON.stringify({ phase: 'develop' }, null, 2));

    withJsonReadCache(() => {
      expect(readJsonFileDetailed(target).value.phase).toBe('develop');
      expect(readJsonFileDetailed(target).value.phase).toBe('develop');
      expect(getJsonReadCacheStats()).toMatchObject({
        active: true,
        entries: 1,
        hits: 1,
        misses: 1,
      });
    });

    expect(getJsonReadCacheStats().active).toBe(false);
  });

  it('does not leak stale values across cache scopes', () => {
    const cwd = makeWorkspace();
    const target = join(cwd, '.forge', 'state.json');
    writeFileSync(target, JSON.stringify({ phase: 'develop' }, null, 2));

    withJsonReadCache(() => {
      expect(readJsonFileDetailed(target).value.phase).toBe('develop');
    });

    writeFileSync(target, JSON.stringify({ phase: 'qa' }, null, 2));

    withJsonReadCache(() => {
      expect(readJsonFileDetailed(target).value.phase).toBe('qa');
    });
  });

  it('enables cache reuse inside runHook invocations', () => {
    const cwd = makeWorkspace();
    const target = join(cwd, '.forge', 'state.json');
    const hookScript = join(FORGE_ROOT, 'scripts', 'fixtures', 'cache-hook.mjs');
    writeFileSync(target, JSON.stringify({ phase: 'develop' }, null, 2));

    const result = spawnSync(process.execPath, [hookScript], {
      cwd,
      input: JSON.stringify({ cwd, path: target }),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.hookSpecificOutput.cacheStats).toMatchObject({
      active: true,
      entries: 1,
      hits: 1,
      misses: 1,
    });
  });

  it('strips dangerous JSON keys during reads', () => {
    const cwd = makeWorkspace();
    const target = join(cwd, '.forge', 'state.json');
    writeFileSync(target, JSON.stringify({
      phase: 'develop',
      __proto__: { polluted: true },
      nested: {
        constructor: { polluted: true },
        safe: 'ok',
      },
    }, null, 2));

    const result = readJsonFileDetailed(target).value;

    expect(result.phase).toBe('develop');
    expect(result.nested.safe).toBe('ok');
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.nested, 'constructor')).toBe(false);
    expect(Reflect.get({}, 'polluted')).toBeUndefined();
  });
});
