import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { buildHealthReport } from './lib/forge-health.mjs';
import { writeForgeState, writeRuntimeState } from './lib/forge-session.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const WORKSPACES: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-health-'));
  WORKSPACES.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

afterEach(() => {
  while (WORKSPACES.length > 0) {
    rmSync(WORKSPACES.pop()!, { recursive: true, force: true });
  }
});

describe('forge health surface', () => {
  it('reports degraded Codex support explicitly', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'health-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      host_context: {
        current_host: 'codex',
      },
    });

    const report = buildHealthReport({ cwd });
    expect(report.host.id).toBe('codex');
    expect(report.host.support_level).toBe('degraded');
    expect(report.warnings[0]).toContain('degraded mode');
  });

  it('prints structured json from the CLI', () => {
    const cwd = makeWorkspace();
    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-health.mjs'), '--json', '--host', 'gemini'], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.host.id).toBe('gemini');
    expect(payload.host.support_level).toBe('degraded');
  });
});
