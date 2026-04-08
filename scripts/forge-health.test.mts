import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { buildHealthReport } from './lib/forge-health.mjs';
import { writeJsonFile } from './lib/forge-io.mjs';
import { writeForgeState, writeRuntimeState } from './lib/forge-session.mjs';
import { getForgeInstallStateFileName } from './lib/forge-setup-manifest.mjs';

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

  it('includes audit details for hook runtime and install state', () => {
    const cwd = makeWorkspace();
    writeJsonFile(join(cwd, getForgeInstallStateFileName()), {
      version: 1,
      profile: 'minimal',
      host: 'codex',
      selective: true,
      mode: 'copy',
    });

    const report = buildHealthReport({
      audit: true,
      cwd,
      hostId: 'codex',
      env: {
        ...process.env,
        FORGE_HOOK_PROFILE: 'minimal',
        FORGE_DISABLED_HOOKS: 'context-manager',
      },
    });

    expect(report.audit.install_state.exists).toBe(true);
    expect(report.audit.install_state.profile).toBe('minimal');
    expect(report.audit.hook_runtime.active_profile).toBe('minimal');
    expect(report.audit.hook_runtime.disabled_hooks).toContain('context-manager');
    expect(report.audit.hook_runtime.total_hooks).toBeGreaterThan(0);
  });

  it('surfaces harness policy and latest decision details', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'policy-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
      harness_policy: {
        strictness_mode: 'guarded',
        verification_mode: 'targeted',
        host_posture: 'bounded_degraded',
        override_policy: 'explicit_only',
        decision_trace_enabled: true,
      },
    });
    writeRuntimeState(cwd, {
      decision_trace: {
        latest: {
          at: new Date().toISOString(),
          scope: 'stop_guard',
          kind: 'block_in_progress',
          target: 'develop',
          summary: 'Blocked stop during develop phase',
          inputs: ['pending work'],
          policy_snapshot: 'guarded/targeted/bounded_degraded',
        },
      },
      verification: {
        updated_at: new Date().toISOString(),
        edited_files: ['src/app.ts'],
        selected_checks: [{ id: 'lint', reason: 'edited source files', command: 'npm run lint' }],
        status: 'passed',
        summary: 'Passed: lint.',
      },
      recovery: {
        latest: {
          id: 'lint::npm run lint',
          at: new Date().toISOString(),
          category: 'lint',
          lane_id: '',
          phase_id: 'develop',
          command: 'npm run lint',
          guidance: 'Lint failed.',
          suggested_command: 'npm run lint',
          retry_count: 1,
          status: 'active',
          summary: 'Lint failed.',
        },
        active: [],
      },
    });

    const report = buildHealthReport({ cwd });
    expect(report.runtime.harness_policy.strictness_mode).toBe('guarded');
    expect(report.runtime.latest_decision.summary).toContain('Blocked stop');
    expect(report.runtime.verification_status).toBe('passed');
    expect(report.runtime.recovery_status).toBe('active');
  });

  it('prints audit data from the CLI when requested', () => {
    const cwd = makeWorkspace();
    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-health.mjs'), '--json', '--audit', '--host', 'codex'], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        FORGE_HOOK_PROFILE: 'strict',
      },
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.audit).toBeDefined();
    expect(payload.audit.hook_runtime.active_profile).toBe('strict');
  });
});
