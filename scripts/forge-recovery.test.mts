import { mkdirSync, readFileSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { recordRecoveryState, writeForgeState, writeRuntimeState } from './lib/forge-session.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const WORKSPACES: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-recovery-'));
  WORKSPACES.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

afterEach(() => {
  while (WORKSPACES.length > 0) {
    rmSync(WORKSPACES.pop()!, { recursive: true, force: true });
  }
});

describe('forge recovery surface', () => {
  it('increments retries for the same recovery thread and escalates at the limit', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'recovery-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {});

    recordRecoveryState(cwd, {
      category: 'lint',
      lane_id: 'api',
      phase_id: 'develop',
      command: 'npm run lint',
      guidance: 'Lint failed.',
      suggested_command: 'npm run lint',
      status: 'active',
      summary: 'Lint failed.',
    });
    recordRecoveryState(cwd, {
      category: 'lint',
      lane_id: 'api',
      phase_id: 'develop',
      command: 'npm run lint',
      guidance: 'Lint failed.',
      suggested_command: 'npm run lint',
      status: 'active',
      summary: 'Lint failed again.',
    });
    const result = recordRecoveryState(cwd, {
      category: 'lint',
      lane_id: 'api',
      phase_id: 'develop',
      command: 'npm run lint',
      guidance: 'Lint failed.',
      suggested_command: 'npm run lint',
      status: 'active',
      summary: 'Lint failed third time.',
    });

    expect(result.recovery.latest.retry_count).toBe(3);
    expect(result.recovery.latest.status).toBe('escalated');
    expect(result.recovery.latest.escalation_reason).toContain('Retry limit reached');
  });

  it('prints structured json from the CLI', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'recovery-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {});
    recordRecoveryState(cwd, {
      category: 'lint',
      lane_id: '',
      phase_id: 'develop',
      command: 'npm run lint',
      guidance: 'Lint failed.',
      suggested_command: 'npm run lint',
      status: 'active',
      summary: 'Lint failed.',
    });

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-recovery.mjs'), '--json'], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.latest.category).toBe('lint');
  });
});
