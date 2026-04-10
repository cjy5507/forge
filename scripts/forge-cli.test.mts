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

function runScript(script: string, args: string[], cwd: string) {
  return spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', script), ...args], {
    cwd,
    encoding: 'utf8',
  });
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe('forge CLI scripts', () => {
  it('forge-status --json returns valid status model', () => {
    const cwd = makeWorkspace();
    const result = runScript('forge-status.mjs', ['--json'], cwd);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ project: '' });
  });

  it('forge-lane-runtime summarize-lanes --json returns lane summary', () => {
    const cwd = makeWorkspace();
    const result = runScript('forge-lane-runtime.mjs', ['summarize-lanes', '--json'], cwd);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      counts: { total: 0 },
      lanes: [],
    });
  });

  it('forge-analytics --json returns analytics report', () => {
    const cwd = makeWorkspace();
    const result = runScript('forge-analytics.mjs', ['--json'], cwd);

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('project');
  });

  it('forge-health --json returns health check', () => {
    const cwd = makeWorkspace();
    const result = runScript('forge-health.mjs', ['--json'], cwd);

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty('host');
  });
});
