import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

import { buildStatusModel, renderStatusText } from './lib/forge-status.mjs';
import { writeForgeState, writeRuntimeState } from './lib/forge-session.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

const WORKSPACES: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-status-'));
  WORKSPACES.push(cwd);
  mkdirSync(join(cwd, '.forge', 'holes'), { recursive: true });
  return cwd;
}

afterEach(() => {
  while (WORKSPACES.length > 0) {
    rmSync(WORKSPACES.pop()!, { recursive: true, force: true });
  }
});

describe('forge status helper', () => {
  it('builds a compact model with next action and issue counts', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'demo-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      lanes: {
        api: {
          id: 'api',
          status: 'in_progress',
          owner_role: 'developer',
          handoff_notes: [{ note: 'Resume API integration tests' }],
        },
      },
    });
    writeFileSync(join(cwd, '.forge', 'holes', 'HOLE-001.md'), '# HOLE-001\n\n**Severity:** Major\n\n## Description\nRegression remains\n');

    const model = buildStatusModel({ cwd });
    expect(model?.project).toBe('demo-app');
    expect(model?.next_action.skill).toBe('continue');
    expect(model?.next_action.summary).toContain('Resume lane api');
    expect(model?.issues.major).toBe(1);
  });

  it('renders compact text with next action first', () => {
    const text = renderStatusText({
      project: 'demo-app',
      mode: 'build',
      phase_id: 'develop',
      phase_name: 'Development',
      phase_index: 3,
      total_phases: 8,
      progress_percent: 55,
      progress_bar: '████████████░░░░░░░░',
      next_action: {
        skill: 'continue',
        summary: 'Resume lane api — Resume API integration tests',
      },
      support_summary: 'Active: api.',
      lanes: { total: 3, done: 1, blocked: 1, details: [] },
      issues: { blocker: 0, major: 1, minor: 2, total: 3 },
      tag: 'forge/v1-design',
      harness: {
        tier: 'medium',
        policy: {
          strictness_mode: 'guarded',
          verification_mode: 'targeted',
          host_posture: 'bounded_degraded',
        },
        latest_decision: null,
        sessions: 3,
        agents: 5,
        failures: 0,
        stops: 1,
      },
    });

    expect(text).toContain('Next action: Resume lane api');
    expect(text).toContain('Lanes: 1/3 done, 1 blocked');
    expect(text).toContain('Harness: tier=medium');
    expect(text).toContain('Policy: guarded/targeted/bounded_degraded');
  });

  it('surfaces merge-ready lanes ahead of active implementation in status output', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'merge-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      lanes: {
        api: {
          id: 'api',
          status: 'in_review',
          owner_role: 'developer',
          review_state: 'approved',
          handoff_notes: [{ note: 'Approved after lead review' }],
        },
        ui: {
          id: 'ui',
          status: 'in_progress',
          owner_role: 'publisher',
          handoff_notes: [{ note: 'Still polishing copy' }],
        },
      },
    });

    const model = buildStatusModel({ cwd });
    expect(model?.next_action.summary).toContain('Merge lane api');
    expect(model?.support_summary).toBe('Merge now: api.');
    expect(model?.lanes.details).toContain('api (developer, merge-ready) — Approved after lead review');
  });

  it('surfaces rebasing lanes ahead of active implementation in status output', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'rebase-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      lanes: {
        api: {
          id: 'api',
          status: 'in_progress',
          owner_role: 'developer',
          merge_state: 'rebasing',
          handoff_notes: [{ note: 'Need rebase after main moved' }],
        },
        ui: {
          id: 'ui',
          status: 'in_progress',
          owner_role: 'publisher',
          handoff_notes: [{ note: 'Still polishing copy' }],
        },
      },
    });

    const model = buildStatusModel({ cwd });
    expect(model?.next_action.summary).toContain('Rebase lane api');
    expect(model?.support_summary).toBe('Rebase now: api.');
    expect(model?.lanes.details).toContain('api (developer, rebasing) — Need rebase after main moved');
  });

  it('prints compact status from the CLI', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'cli-app',
      phase: 'repair',
      phase_id: 'isolate',
      mode: 'repair',
    });
    writeRuntimeState(cwd, {
      analysis: {
        last_type: 'impact',
        last_target: 'src/api.ts',
        stale: true,
      },
    });

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-status.mjs')], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Forge: cli-app (repair)');
    expect(result.stdout).toContain('Next action: Run forge:analyze first');
  });

  it('prints structured json from the CLI', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'json-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      lanes: {
        ui: {
          id: 'ui',
          status: 'ready',
          owner_role: 'publisher',
        },
      },
    });

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-status.mjs'), '--json'], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.project).toBe('json-app');
    expect(payload.next_action.skill).toBe('continue');
    expect(payload.lanes.total).toBe(1);
  });

  it('surfaces host support warnings for degraded hosts', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'host-app',
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

    const model = buildStatusModel({ cwd });
    expect(model?.host_support_warning).toContain('degraded mode');

    const text = renderStatusText(model);
    expect(text).toContain('Host support: Codex runs in degraded mode');
  });

  it('ignores legacy holes older than the active project window', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'scoped-app',
      phase: 'delivery',
      phase_id: 'delivery',
      created_at: '2026-04-05T00:00:00.000Z',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {});

    const legacyHole = join(cwd, '.forge', 'holes', 'HOLE-OLD.md');
    const currentHole = join(cwd, '.forge', 'holes', 'HOLE-CURRENT.md');
    writeFileSync(legacyHole, '# HOLE-OLD\n\n**Severity:** Blocker\n\n## Description\nLegacy blocker\n');
    writeFileSync(currentHole, '# HOLE-CURRENT\n\n**Severity:** Minor\n\n## Description\nCurrent minor\n');
    utimesSync(legacyHole, new Date('2026-04-04T00:00:00.000Z'), new Date('2026-04-04T00:00:00.000Z'));
    utimesSync(currentHole, new Date('2026-04-06T00:00:00.000Z'), new Date('2026-04-06T00:00:00.000Z'));

    const model = buildStatusModel({ cwd });
    expect(model?.issues.blocker).toBe(0);
    expect(model?.issues.minor).toBe(1);
  });

  it('counts only tracked open holes for the active project', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'tracked-app',
      phase: 'complete',
      phase_id: 'complete',
      mode: 'repair',
      holes: ['HOLE-OPEN', 'HOLE-VERIFIED'],
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {});

    writeFileSync(join(cwd, '.forge', 'holes', 'HOLE-OPEN.md'), '# HOLE-OPEN\n\n**Severity:** Major\n**Status:** open\n\n## Description\nCurrent open issue\n');
    writeFileSync(join(cwd, '.forge', 'holes', 'HOLE-VERIFIED.md'), '# HOLE-VERIFIED\n\n**Severity:** Major\n**Status:** verified\n\n## Description\nFixed issue\n');
    writeFileSync(join(cwd, '.forge', 'holes', 'HOLE-LEGACY.md'), '# HOLE-LEGACY\n\n**Severity:** Blocker\n**Status:** open\n\n## Description\nLegacy issue\n');

    const model = buildStatusModel({ cwd });
    expect(model?.issues.blocker).toBe(0);
    expect(model?.issues.major).toBe(1);
    expect(model?.issues.total).toBe(1);
  });

  it('surfaces shared .forge host handoff when resume switches hosts', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'handoff-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      host_context: {
        current_host: 'codex',
        previous_host: 'claude',
        last_event_host: 'codex',
        last_event_name: 'session.start',
        last_resume_host: 'codex',
      },
    });

    const model = buildStatusModel({ cwd });
    expect(model?.host_handoff).toContain('Claude -> Codex');

    const text = renderStatusText(model);
    expect(text).toContain('Shared .forge handoff: Claude -> Codex');
  });

  it('surfaces explicit trust warnings when runtime.json is malformed', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'trust-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeFileSync(join(cwd, '.forge', 'runtime.json'), '{not-valid-json');

    const model = buildStatusModel({ cwd });
    expect(model?.state_trust_warnings?.[0]).toContain('.forge/runtime.json');

    const text = renderStatusText(model);
    expect(text).toContain('State trust:');
    expect(text).toContain('.forge/runtime.json');
  });

  it('returns a warning model when state.json exists but is malformed', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, '.forge', 'state.json'), '{not-valid-json');

    const model = buildStatusModel({ cwd });
    expect(model?.phase_name).toBe('State Warning');
    expect(model?.next_action.summary).toContain('Repair Forge state files');
    expect(model?.state_trust_warnings?.[0]).toContain('.forge/state.json');
  });

  it('surfaces explicit trust warnings when state.json has invalid critical shape', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify({
      phase: 5,
      phase_id: null,
      status: true,
      mode: 'build',
    }, null, 2));

    const model = buildStatusModel({ cwd });
    expect(model?.state_trust_warnings?.[0]).toContain('Critical fields are invalid in .forge/state.json');

    const text = renderStatusText(model);
    expect(text).toContain('State trust:');
    expect(text).toContain('.forge/state.json');
  });

  it('surfaces integrity fingerprint mismatches when state files are edited externally', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'integrity-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });

    const statePath = join(cwd, '.forge', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.project = 'tampered-app';
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const model = buildStatusModel({ cwd });
    expect(model?.state_trust_warnings?.some(warning => warning.includes('fingerprint mismatch'))).toBe(true);

    const text = renderStatusText(model);
    expect(text).toContain('fingerprint mismatch');
  });

  it('renders harness policy posture in status output', () => {
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

    const model = buildStatusModel({ cwd });
    const text = renderStatusText(model);
    expect(text).toContain('Policy: guarded/targeted/bounded_degraded');
  });

  it('surfaces latest deterministic decision in verbose status output', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'decision-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      decision_trace: {
        latest: {
          at: new Date().toISOString(),
          scope: 'recovery',
          kind: 'failure_test',
          target: 'Bash',
          summary: 'Retry targeted verification after failure',
          inputs: ['npm test'],
          policy_snapshot: 'guarded/targeted/bounded_degraded',
        },
      },
    });

    const model = buildStatusModel({ cwd });
    const text = renderStatusText(model, { verbose: true });
    expect(text).toContain('Latest decision: Retry targeted verification after failure');
  });

  it('surfaces verification and recovery state in status output', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'verify-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
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

    const model = buildStatusModel({ cwd });
    const text = renderStatusText(model);
    expect(text).toContain('Verification: passed');
    expect(text).toContain('Recovery: active');
  });
});
