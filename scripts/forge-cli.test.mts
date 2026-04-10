import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const TEMP_DIRS: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-cli-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
  });
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe('forge umbrella CLI', () => {
  it('prints usage for help', () => {
    const cwd = makeWorkspace();
    const result = runCli(['help'], cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Forge CLI');
    expect(result.stdout).toContain('forge status');
  });

  it('fails cleanly for unknown commands', () => {
    const cwd = makeWorkspace();
    const result = runCli(['unknown-command'], cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[forge] Unknown command: unknown-command');
  });

  it('proxies status output', () => {
    const cwd = makeWorkspace();
    const result = runCli(['status', '--json'], cwd);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ project: '' });
  });

  it('maps lane summarize to summarize-lanes', () => {
    const cwd = makeWorkspace();
    const result = runCli(['lane', 'summarize', '--json'], cwd);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      counts: { total: 0 },
      lanes: [],
    });
  });
});
