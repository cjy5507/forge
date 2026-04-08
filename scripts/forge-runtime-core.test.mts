import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { applyHostContext, describeCrossHostResume, detectHostId } from './lib/forge-host-context.mjs';
import { compactForgeContext, initLaneRecord, markLaneMergeState, markLaneReviewState, readRuntimeState, selectContinuationTarget, setLaneOwner, setLaneStatus, updateRuntimeState, readForgeState, writeForgeState, writeRuntimeState } from './lib/forge-session.mjs';
import { selectNextLane } from './lib/forge-lanes.mjs';
import { inferTierFromState, suggestTierDeescalation } from './lib/forge-tiers.mjs';
import { checkPhaseGate } from './lib/forge-phases.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const TEMP_DIRS = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-runtime-core-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function readRuntimeFile(cwd) {
  return JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
}

function runLaneRuntime(args, cwd) {
  const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-lane-runtime.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop(), { recursive: true, force: true });
  }
});

describe('forge runtime core', () => {
  it('resolves the canonical runtime file from nested worktree paths', () => {
    const root = makeWorkspace();
    const worktreeCwd = join(root, '.forge', 'worktrees', 'api');
    mkdirSync(worktreeCwd, { recursive: true });

    writeRuntimeState(root, {
      lanes: {
        api: {
          id: 'api',
          title: 'API lane',
          worktree_path: worktreeCwd,
          status: 'ready',
        },
      },
    });

    const runtime = readRuntimeState(worktreeCwd);
    expect(runtime.lanes.api.title).toBe('API lane');
    expect(runtime.active_worktrees.api).toBe(worktreeCwd);
  });

  it('throws instead of writing without a lock after repeated lock contention', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, '.forge', 'forge.lock'), `${process.pid}.${Date.now()}`);

    expect(() => updateRuntimeState(cwd, current => ({
      ...current,
      next_session_goal: 'should not write without lock',
    }))).toThrow(/lock acquisition failed/i);
  });

  it('tracks cross-host resume context without changing the continuation model', () => {
    const runtime = applyHostContext({
      host_context: {
        current_host: 'claude',
      },
    }, {
      hostId: 'codex',
      eventName: 'session.start',
      resumed: true,
    });

    expect(runtime.host_context.current_host).toBe('codex');
    expect(runtime.host_context.previous_host).toBe('claude');
    expect(runtime.host_context.last_event_name).toBe('session.start');
    expect(runtime.host_context.last_resume_host).toBe('codex');
  });

  it('accepts explicit Gemini and Qwen host ids without relying on env heuristics', () => {
    expect(detectHostId({ hostId: 'gemini' }, {})).toBe('gemini');
    expect(detectHostId({ host_id: 'qwen' }, { CLAUDE_PLUGIN_ROOT: '/tmp/claude' })).toBe('qwen');
  });

  it('renders cross-host handoff text for newly declared hosts', () => {
    const handoff = describeCrossHostResume({
      host_context: {
        current_host: 'qwen',
        previous_host: 'gemini',
      },
    });

    expect(handoff).toContain('Gemini CLI');
    expect(handoff).toContain('Qwen Code');
  });

  it('provides transition helpers that keep lane state and control-tower hints in sync', () => {
    const root = makeWorkspace();
    writeForgeState(root, {
      project: 'Forge',
      phase: 'develop',
      spec_approved: true,
      design_approved: true,
    });

    const initial = writeRuntimeState(root, {});
    const withLane = initLaneRecord(initial, {
      laneId: 'api',
      title: 'API lane',
      worktreePath: '.forge/worktrees/api',
      taskFile: '.forge/tasks/api.md',
    });
    const owned = setLaneOwner(withLane, {
      laneId: 'api',
      ownerRole: 'developer',
      ownerAgentId: 'agent-api',
      ownerAgentType: 'executor',
    });
    const inProgress = setLaneStatus(owned, {
      laneId: 'api',
      status: 'in_progress',
      note: 'Implementation started',
    });
    const changesRequested = markLaneReviewState(inProgress, {
      laneId: 'api',
      reviewState: 'changes_requested',
      note: 'Use fetchUser naming',
    });
    const rebasing = markLaneMergeState(changesRequested, {
      laneId: 'api',
      mergeState: 'rebasing',
      note: 'main advanced after ui merge',
    });

    expect(rebasing.lanes.api.owner_agent_id).toBe('agent-api');
    expect(rebasing.lanes.api.owner_agent_type).toBe('executor');
    expect(rebasing.lanes.api.review_state).toBe('changes_requested');
    expect(rebasing.lanes.api.merge_state).toBe('rebasing');
    expect(rebasing.active_worktrees.api).toBe('.forge/worktrees/api');
    expect(rebasing.next_lane).toBe('api');

    const context = compactForgeContext(readForgeState(root), rebasing);
    expect(context).toContain('↺api');
    expect(context).toContain('rebase');
  });

  it('prioritizes rebasing and changes-requested lanes for resume selection', () => {
    const lane = selectNextLane({
      lanes: {
        docs: {
          id: 'docs',
          status: 'ready',
        },
        api: {
          id: 'api',
          status: 'in_review',
          review_state: 'changes_requested',
        },
        ui: {
          id: 'ui',
          status: 'ready',
          merge_state: 'rebasing',
        },
      },
    });

    expect(lane).toBe('ui');
  });

  it('prioritizes merge-ready lanes before more implementation work', () => {
    const lane = selectNextLane({
      lanes: {
        worker: {
          id: 'worker',
          status: 'in_progress',
        },
        api: {
          id: 'api',
          status: 'in_review',
          review_state: 'approved',
        },
      },
    });

    expect(lane).toBe('api');
  });

  it('ignores explicit next_lane when that lane is already terminal', () => {
    const lane = selectNextLane({
      next_lane: 'api',
      lanes: {
        api: {
          id: 'api',
          status: 'done',
        },
        ui: {
          id: 'ui',
          status: 'ready',
        },
      },
    });

    expect(lane).toBe('ui');
  });

  it('requires a handoff note before sending a lane into review', () => {
    const cwd = makeWorkspace();
    const init = runLaneRuntime([
      'init-lane',
      '--lane',
      'api',
      '--title',
      'API lane',
      '--worktree',
      '.forge/worktrees/api',
    ], cwd);
    expect(init.status).toBe(0);

    const review = runLaneRuntime([
      'update-lane-status',
      '--lane',
      'api',
      '--status',
      'in_review',
    ], cwd);

    expect(review.status).not.toBe(0);
    expect(review.stderr).toContain('handoff');
  });

  it('exposes explicit review and merge transitions via the lane runtime cli', () => {
    const cwd = makeWorkspace();
    const worktreePath = '.forge/worktrees/api';

    expect(runLaneRuntime([
      'init-lane',
      '--lane',
      'api',
      '--title',
      'API lane',
      '--worktree',
      worktreePath,
    ], cwd).status).toBe(0);

    expect(runLaneRuntime([
      'write-handoff',
      '--lane',
      'api',
      '--note',
      'Ready for review after tests',
    ], cwd).status).toBe(0);

    expect(runLaneRuntime([
      'mark-review-state',
      '--lane',
      'api',
      '--state',
      'changes_requested',
      '--note',
      'Align helper naming with living standard',
    ], cwd).status).toBe(0);

    expect(runLaneRuntime([
      'mark-merge-state',
      '--lane',
      'api',
      '--state',
      'rebasing',
      '--note',
      'main advanced after contracts lane merged',
    ], cwd).status).toBe(0);

    const runtime = readRuntimeFile(cwd);
    expect(runtime.lanes.api.review_state).toBe('changes_requested');
    expect(runtime.lanes.api.merge_state).toBe('rebasing');
    expect(runtime.next_lane).toBe('api');
  });

  it('summarizes lanes without crashing after explicit review and merge transitions', () => {
    const cwd = makeWorkspace();

    expect(runLaneRuntime([
      'init-lane',
      '--lane',
      'api',
      '--title',
      'API lane',
      '--worktree',
      '.forge/worktrees/api',
    ], cwd).status).toBe(0);

    expect(runLaneRuntime([
      'write-handoff',
      '--lane',
      'api',
      '--note',
      'Ready for control tower summary',
    ], cwd).status).toBe(0);

    expect(runLaneRuntime([
      'mark-review-state',
      '--lane',
      'api',
      '--state',
      'changes_requested',
      '--note',
      'Follow the living standard before merge',
    ], cwd).status).toBe(0);

    const summary = runLaneRuntime(['summarize-lanes', '--json'], cwd);
    expect(summary.status).toBe(0);

    const parsed = JSON.parse(summary.stdout);
    expect(parsed.next_lane).toBe('api');
    expect(parsed.briefs).toContain('api:changes');
  });

  it('surfaces merge-ready lanes in next action summaries', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Forge',
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
          review_state: 'approved',
          handoff_notes: [{ note: 'Approved after lead review' }],
        },
        ui: {
          id: 'ui',
          status: 'in_progress',
          handoff_notes: [{ note: 'Still wiring tests' }],
        },
      },
    });

    const runtime = readRuntimeState(cwd);
    expect(runtime.next_lane).toBe('api');
    expect(runtime.next_action.summary).toContain('Merge lane api');
  });

  it('surfaces rebasing lanes in next action summaries before active work', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Forge',
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
          merge_state: 'rebasing',
          handoff_notes: [{ note: 'Need rebase after auth merged' }],
        },
        ui: {
          id: 'ui',
          status: 'in_progress',
          handoff_notes: [{ note: 'Still wiring tests' }],
        },
      },
    });

    const runtime = readRuntimeState(cwd);
    expect(runtime.next_lane).toBe('api');
    expect(runtime.next_action.summary).toContain('Rebase lane api');
  });

  it('includes next action in human-readable summarize-lanes output', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });

    expect(runLaneRuntime([
      'init-lane',
      '--lane',
      'api',
      '--title',
      'API lane',
      '--worktree',
      '.forge/worktrees/api',
    ], cwd).status).toBe(0);

    expect(runLaneRuntime([
      'write-handoff',
      '--lane',
      'api',
      '--note',
      'Resume api lane after auth tests',
    ], cwd).status).toBe(0);

    const summary = runLaneRuntime(['summarize-lanes'], cwd);
    expect(summary.status).toBe(0);
    expect(summary.stdout).toContain('Next action: Continue lane api');
  });

  it('records analysis metadata to state and runtime via the lane runtime cli', () => {
    const cwd = makeWorkspace();
    mkdirSync(join(cwd, '.forge', 'design'), { recursive: true });
    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'design',
      spec_approved: true,
    });
    writeFileSync(join(cwd, '.forge', 'design', 'codebase-analysis.md'), '# Analysis\n');

    const result = runLaneRuntime([
      'record-analysis',
      '--type',
      'architecture',
      '--target',
      'scripts/lib',
      '--artifact',
      '.forge/design/codebase-analysis.md',
      '--graph-health',
      'module-only',
      '--confidence',
      'medium',
      '--risk',
      'local',
      '--summary',
      'Module graph only; fallback required for call paths',
    ], cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('type: architecture');
    expect(result.stdout).toContain('artifact_exists: yes');

    const state = readForgeState(cwd);
    const runtime = readRuntimeState(cwd);
    expect(state.analysis.last_type).toBe('architecture');
    expect(state.analysis.last_target).toBe('scripts/lib');
    expect(runtime.analysis.confidence).toBe('medium');
    expect(runtime.analysis.graph_health).toBe('module-only');
    expect(runtime.analysis.stale).toBe(false);
  });

  it('reports analysis status as stale when the artifact is missing', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'develop',
      spec_approved: true,
      design_approved: true,
    });

    expect(runLaneRuntime([
      'record-analysis',
      '--type',
      'impact',
      '--target',
      'scripts/write-gate.mjs',
      '--artifact',
      '.forge/design/missing-analysis.md',
      '--confidence',
      'low',
      '--graph-health',
      'sparse',
      '--risk',
      'systemic',
    ], cwd).status).toBe(0);

    const status = runLaneRuntime(['analysis-status', '--json'], cwd);
    expect(status.status).toBe(0);

    const payload = JSON.parse(status.stdout);
    expect(payload.analysis_type).toBe('impact');
    expect(payload.artifact_exists).toBe(false);
    expect(payload.stale).toBe(true);
    expect(payload.risk_level).toBe('systemic');
  });

  it('persists session brief and session handoff through the runtime cli', () => {
    const cwd = makeWorkspace();

    const brief = runLaneRuntime([
      'set-session-brief',
      '--goal',
      'Close auth review and prep merge',
      '--exit-criteria',
      'auth PR approved,qa smoke rerun',
      '--next-goal',
      'Rebase ui lane after auth merge',
      '--next-owner',
      'lead-dev',
      '--handoff',
      'Auth lane is the priority for this session',
    ], cwd);
    expect(brief.status).toBe(0);

    const handoff = runLaneRuntime([
      'write-session-handoff',
      '--summary',
      'Auth PR approved; next session should start with ui rebase',
      '--next-goal',
      'Start ui rebase and rerun smoke tests',
      '--next-owner',
      'developer',
    ], cwd);
    expect(handoff.status).toBe(0);

    const runtime = readRuntimeFile(cwd);
    expect(runtime.current_session_goal).toBe('Close auth review and prep merge');
    expect(runtime.session_exit_criteria).toEqual(['auth PR approved', 'qa smoke rerun']);
    expect(runtime.next_session_goal).toBe('Start ui rebase and rerun smoke tests');
    expect(runtime.next_session_owner).toBe('developer');
    expect(runtime.session_handoff_summary).toContain('ui rebase');
  });

  it('refreshes session brief automatically when the phase changes', () => {
    const cwd = makeWorkspace();

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'discovery',
      phase_id: 'discovery',
      phase_name: 'discovery',
      spec_approved: false,
      design_approved: false,
    });

    runLaneRuntime([
      'set-session-brief',
      '--goal',
      'Close discovery questions this session',
      '--next-owner',
      'pm',
    ], cwd);

    let runtime = readRuntimeState(cwd);
    expect(runtime.current_session_goal.toLowerCase()).toContain('scope');
    expect(runtime.next_session_owner).toBe('pm');

    writeFileSync(
      join(cwd, '.forge', 'spec.md'),
      '# Spec\n\n## Overview\nDesign-ready project.\n\n## Constraints\nKeep phase-gate tests valid with the required artifact.\n\nAdditional content to satisfy the minimum file size check.',
    );

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'design',
      phase_id: 'design',
      phase_name: 'design',
      spec_approved: true,
      design_approved: false,
    });

    runtime = readRuntimeState(cwd);
    expect(runtime.current_session_goal.toLowerCase()).toContain('design');
    expect(runtime.next_session_owner).toBe('cto');
  });

  it('caps persisted lanes and handoff notes to prevent unbounded runtime growth', () => {
    const cwd = makeWorkspace();
    const lanes = Object.fromEntries(
      Array.from({ length: 55 }, (_, index) => {
        const laneId = `lane-${index + 1}`;
        return [laneId, {
          id: laneId,
          title: `Lane ${index + 1}`,
          status: 'ready',
          handoff_notes: Array.from({ length: 105 }, (_, noteIndex) => ({
            at: `2026-04-05T00:00:${String(noteIndex).padStart(2, '0')}Z`,
            kind: 'handoff',
            note: `${laneId} note ${noteIndex + 1}`,
          })),
        }];
      }),
    );

    const runtime = writeRuntimeState(cwd, { lanes });

    expect(Object.keys(runtime.lanes)).toHaveLength(50);
    expect(Object.keys(runtime.lanes)).not.toContain('lane-1');
    expect(Object.keys(runtime.lanes)).toContain('lane-55');
    expect(runtime.lanes['lane-55'].handoff_notes).toHaveLength(100);
    expect(runtime.lanes['lane-55'].handoff_notes[0].note).toBe('lane-55 note 6');
    expect(runtime.lanes['lane-55'].handoff_notes.at(-1)?.note).toBe('lane-55 note 105');
  });

  it('updates company gate state through the runtime cli and refreshes session ownership', () => {
    const cwd = makeWorkspace();

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'delivery',
      phase_id: 'delivery',
      phase_name: 'delivery',
      spec_approved: true,
      design_approved: true,
    });

    const gate = runLaneRuntime([
      'set-company-gate',
      '--gate',
      'security',
      '--gate-owner',
      'security-reviewer',
      '--delivery-state',
      'blocked',
      '--internal-blockers',
      'Auth bypass remains,Secret found in config',
    ], cwd);
    expect(gate.status).toBe(0);

    let runtime = readRuntimeFile(cwd);
    expect(runtime.active_gate).toBe('security');
    expect(runtime.active_gate_owner).toBe('security-reviewer');
    expect(runtime.delivery_readiness).toBe('blocked');
    expect(runtime.internal_blockers).toHaveLength(2);
    expect(runtime.next_session_owner).toBe('security-reviewer');

    const customerBlocker = runLaneRuntime([
      'set-company-gate',
      '--gate',
      'customer_review',
      '--delivery-state',
      'in_progress',
      '--customer-blockers',
      'Confirm billing copy',
    ], cwd);
    expect(customerBlocker.status).toBe(0);

    runtime = readRuntimeFile(cwd);
    expect(runtime.active_gate).toBe('customer_review');
    expect(runtime.customer_blockers).toHaveLength(1);
    expect(runtime.next_session_owner).toBe('pm');
  });

  it('routes customer review re-entry back to the internal owner when the phase moves to fix', () => {
    const cwd = makeWorkspace();

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'delivery',
      phase_id: 'delivery',
      phase_name: 'delivery',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });

    expect(runLaneRuntime([
      'set-company-gate',
      '--gate',
      'customer_review',
      '--gate-owner',
      'pm',
      '--delivery-state',
      'in_progress',
      '--customer-blockers',
      'Customer found checkout bug',
    ], cwd).status).toBe(0);

    let runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('customer_review');
    expect(runtime.next_session_owner).toBe('pm');
    expect(runtime.current_session_goal).toContain('Customer found checkout bug');

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'fix',
      phase_id: 'fix',
      phase_name: 'fix',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });

    runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('implementation_readiness');
    expect(runtime.active_gate_owner).toBe('lead-dev');
    expect(runtime.next_session_owner).toBe('lead-dev');
    expect(runtime.current_session_goal).toBe('Prepare reviewable implementation lanes');
    expect(runtime.session_handoff_summary).toContain('lead-dev');
  });

  it('re-derives the session anchor when customer blockers change within the same internal phase', () => {
    const cwd = makeWorkspace();

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'fix',
      phase_id: 'fix',
      phase_name: 'fix',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });

    let runtime = writeRuntimeState(cwd, {
      company_mode: 'autonomous_company',
      active_gate: 'implementation_readiness',
      active_gate_owner: 'lead-dev',
      customer_blockers: [],
      internal_blockers: [],
    });

    runtime = readRuntimeState(cwd);
    expect(runtime.next_session_owner).toBe('lead-dev');
    expect(runtime.session_customer_blocker_count).toBe(0);

    writeRuntimeState(cwd, {
      ...runtime,
      customer_blockers: [{ summary: 'Need pricing signoff' }],
    });

    runtime = readRuntimeState(cwd);
    expect(runtime.next_session_owner).toBe('lead-dev');
    expect(runtime.current_session_goal).toBe('Prepare reviewable implementation lanes');
    expect(runtime.session_customer_blocker_count).toBe(1);
  });

  it('reacquires PM ownership after internal re-entry returns to delivery with customer blockers', () => {
    const cwd = makeWorkspace();

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'fix',
      phase_id: 'fix',
      phase_name: 'fix',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });

    writeRuntimeState(cwd, {
      company_mode: 'autonomous_company',
      active_gate: 'implementation_readiness',
      active_gate_owner: 'lead-dev',
      delivery_readiness: 'in_progress',
      customer_blockers: [{ summary: 'Need pricing signoff' }],
      internal_blockers: [],
    });

    let runtime = readRuntimeState(cwd);
    expect(runtime.next_session_owner).toBe('lead-dev');

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'delivery',
      phase_id: 'delivery',
      phase_name: 'delivery',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });

    runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('customer_review');
    expect(runtime.next_session_owner).toBe('pm');
    expect(runtime.current_session_goal).toContain('Need pricing signoff');
  });

  it('refreshes company gate automatically when the phase changes', () => {
    const cwd = makeWorkspace();

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'discovery',
      phase_id: 'discovery',
      phase_name: 'discovery',
      spec_approved: false,
      design_approved: false,
    });

    runLaneRuntime([
      'set-company-gate',
      '--gate',
      'spec_readiness',
      '--gate-owner',
      'pm',
      '--delivery-state',
      'in_progress',
    ], cwd);

    let runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('spec_readiness');
    expect(runtime.active_gate_owner).toBe('pm');

    writeFileSync(
      join(cwd, '.forge', 'spec.md'),
      '# Spec\n\n## Overview\nDesign-ready project.\n\n## Constraints\nKeep company-gate refresh tests valid with the required artifact.\n\nAdditional content to satisfy the minimum file size check.',
    );

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'design',
      phase_id: 'design',
      phase_name: 'design',
      spec_approved: true,
      design_approved: false,
    });

    runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('design_readiness');
    expect(runtime.active_gate_owner).toBe('cto');
  });

  it('persists auto-derived company gate into runtime.json when state changes', () => {
    const cwd = makeWorkspace();

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'delivery',
      phase_id: 'delivery',
      phase_name: 'delivery',
      spec_approved: true,
      design_approved: true,
    });

    let runtime = readRuntimeFile(cwd);
    expect(runtime.active_gate).toBe('delivery_readiness');
    expect(runtime.active_gate_owner).toBe('ceo');

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'security',
      phase_id: 'security',
      phase_name: 'security',
      spec_approved: true,
      design_approved: true,
    });

    runtime = readRuntimeFile(cwd);
    expect(runtime.active_gate).toBe('security');
    expect(runtime.active_gate_owner).toBe('security-reviewer');
  });

  it('includes company gate and session brief in summarize-lanes json output', () => {
    const cwd = makeWorkspace();

    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'delivery',
      phase_id: 'delivery',
      phase_name: 'delivery',
      spec_approved: true,
      design_approved: true,
    });

    runLaneRuntime([
      'set-company-gate',
      '--gate',
      'security',
      '--gate-owner',
      'security-reviewer',
      '--delivery-state',
      'blocked',
      '--internal-blockers',
      'Auth issue remains',
    ], cwd);

    runLaneRuntime([
      'set-session-brief',
      '--goal',
      'Clear security blockers',
      '--next-goal',
      'Rerun security review',
      '--next-owner',
      'security-reviewer',
      '--handoff',
      'Auth issue blocks delivery',
    ], cwd);

    const summary = runLaneRuntime(['summarize-lanes', '--json'], cwd);
    expect(summary.status).toBe(0);

    const parsed = JSON.parse(summary.stdout);
    expect(parsed.active_gate).toBe('security');
    expect(parsed.delivery_readiness).toBe('blocked');
    expect(parsed.current_session_goal.toLowerCase()).toContain('security');
    expect(parsed.next_session_owner).toBe('security-reviewer');
    expect(parsed.next_action.skill).toBe('continue');
    expect(typeof parsed.next_action.summary).toBe('string');
  });

  it('selectContinuationTarget returns customer_blocker first', () => {
    const state = { phase_id: 'develop' };
    const runtime = {
      customer_blockers: [{ summary: 'Need API key from client' }],
      internal_blockers: [{ summary: 'DB schema incomplete' }],
      lanes: { api: { id: 'api', status: 'in_progress', handoff_notes: [{ note: 'auth done' }] } },
      next_lane: 'api',
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('customer_blocker');
    expect(result.detail).toBe('Need API key from client');
  });

  it('selectContinuationTarget returns internal_blocker when no customer blocker', () => {
    const state = { phase_id: 'develop' };
    const runtime = {
      customer_blockers: [],
      internal_blockers: [{ summary: 'DB schema incomplete' }],
      active_gate_owner: 'cto',
      lanes: { api: { id: 'api', status: 'in_progress' } },
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('internal_blocker');
    expect(result.detail).toContain('DB schema');
    expect(result.detail).toContain('cto');
  });

  it('selectContinuationTarget routes to analysis refresh when repair flow has no analysis yet', () => {
    const state = { phase_id: 'isolate', mode: 'repair' };
    const runtime = {
      customer_blockers: [],
      internal_blockers: [],
      lanes: {},
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('analysis_refresh');
    expect(result.detail).toContain('no codebase analysis');
  });

  it('selectContinuationTarget routes to analysis refresh when saved analysis is stale', () => {
    const state = { phase_id: 'develop', mode: 'build' };
    const runtime = {
      customer_blockers: [],
      internal_blockers: [],
      analysis: {
        last_type: 'impact',
        last_target: 'scripts/write-gate.mjs',
        stale: true,
      },
      lanes: {
        api: { id: 'api', status: 'in_progress', handoff_notes: [{ note: 'resume api lane' }] },
      },
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('analysis_refresh');
    expect(result.target).toBe('scripts/write-gate.mjs');
    expect(result.detail).toContain('stale');
  });

  it('selectContinuationTarget returns active_lane with handoff notes', () => {
    const state = { phase_id: 'develop' };
    const runtime = {
      customer_blockers: [],
      internal_blockers: [],
      lanes: {
        api: { id: 'api', status: 'in_progress', handoff_notes: [{ note: 'auth routes done, testing middleware' }] },
        ui: { id: 'ui', status: 'ready' },
      },
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('active_lane');
    expect(result.target).toBe('api');
    expect(result.detail).toContain('middleware');
  });

  it('selectContinuationTarget falls back to next_lane when no handoff notes', () => {
    const state = { phase_id: 'develop' };
    const runtime = {
      customer_blockers: [],
      internal_blockers: [],
      lanes: {
        api: { id: 'api', status: 'in_progress' },
        ui: { id: 'ui', status: 'ready' },
      },
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('next_lane');
    expect(result.target).toBe('api');
  });

  it('selectContinuationTarget falls back to phase when no lanes', () => {
    const state = { phase_id: 'design' };
    const runtime = {
      customer_blockers: [],
      internal_blockers: [],
      lanes: {},
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('phase');
    expect(result.target).toBe('design');
  });

  it('readRuntimeState derives next_action for stale analysis refresh', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Forge',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      analysis: {
        last_type: 'impact',
        last_target: 'scripts/write-gate.mjs',
        stale: true,
      },
    });

    const runtime = readRuntimeState(cwd);
    expect(runtime.next_action.skill).toBe('analyze');
    expect(runtime.next_action.target).toBe('scripts/write-gate.mjs');
    expect(runtime.next_action.summary).toContain('forge:analyze');
  });

  it('readRuntimeState derives next_action for active lane resumes', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Forge',
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
          handoff_notes: [{ note: 'resume api lane after auth tests' }],
        },
      },
    });

    const runtime = readRuntimeState(cwd);
    expect(runtime.next_action.skill).toBe('continue');
    expect(runtime.next_action.kind).toBe('active_lane');
    expect(runtime.next_action.summary).toContain('Resume lane api');
  });

  it('selectContinuationTarget works with no runtime at all', () => {
    const state = { phase_id: 'discovery' };
    const result = selectContinuationTarget(state, undefined);
    expect(result.kind).toBe('phase');
    expect(result.target).toBe('discovery');
  });

  it('selectContinuationTarget ignores inactive lane with only handoff notes', () => {
    const state = { phase_id: 'develop' };
    const runtime = {
      customer_blockers: [],
      internal_blockers: [],
      lanes: {
        api: { id: 'api', status: 'done', handoff_notes: [{ note: 'completed' }] },
        ui: { id: 'ui', status: 'ready' },
      },
    };
    const result = selectContinuationTarget(state, runtime);
    // Should not pick 'api' (done) even though it has handoff notes
    // Should pick 'ui' via next_lane fallback
    expect(result.kind).toBe('next_lane');
    expect(result.target).toBe('ui');
  });
});

// ─── Fix 1: Tier de-escalation ───────────────────────────────────────────

describe('inferTierFromState de-escalation', () => {
  it('returns light for delivery phase with no holes and all lanes done', () => {
    const state = {
      phase_id: 'delivery',
      holes: [],
      lanes: {
        api: { status: 'done' },
        ui: { status: 'merged' },
      },
    };
    expect(inferTierFromState(state)).toBe('light');
  });

  it('returns light for complete phase with no holes and all lanes done', () => {
    const state = {
      phase_id: 'complete',
      holes: [],
      lanes: {
        api: { status: 'merged' },
      },
    };
    expect(inferTierFromState(state)).toBe('light');
  });

  it('returns full for delivery phase when holes remain', () => {
    const state = {
      phase_id: 'delivery',
      holes: [{ id: 'h1', summary: 'auth bypass' }],
      lanes: {
        api: { status: 'done' },
      },
    };
    expect(inferTierFromState(state)).toBe('full');
  });

  it('returns full for delivery phase when some lanes are not done', () => {
    const state = {
      phase_id: 'delivery',
      holes: [],
      lanes: {
        api: { status: 'done' },
        ui: { status: 'in_progress' },
      },
    };
    expect(inferTierFromState(state)).toBe('full');
  });

  it('returns light for fix phase with no holes', () => {
    const state = {
      phase_id: 'fix',
      holes: [],
    };
    expect(inferTierFromState(state)).toBe('light');
  });

  it('returns light for fix phase with holes count <= 2 (original behavior preserved)', () => {
    const state = {
      phase_id: 'fix',
      holes: [{ id: 'h1' }, { id: 'h2' }],
    };
    expect(inferTierFromState(state)).toBe('light');
  });
});

describe('suggestTierDeescalation', () => {
  it('returns null for null state', () => {
    expect(suggestTierDeescalation(null)).toBeNull();
  });

  it('returns light when full tier at delivery with no holes and all lanes done', () => {
    const state = {
      tier: 'full',
      phase_id: 'delivery',
      holes: [],
      lanes: {
        api: { status: 'done' },
        ui: { status: 'merged' },
      },
    };
    expect(suggestTierDeescalation(state)).toBe('light');
  });

  it('returns light when full tier at complete phase', () => {
    const state = {
      tier: 'full',
      phase_id: 'complete',
      holes: [],
    };
    expect(suggestTierDeescalation(state)).toBe('light');
  });

  it('returns medium when full tier is over-provisioned (low task/hole count)', () => {
    const state = {
      tier: 'full',
      phase_id: 'develop',
      tasks: [{ id: 't1' }, { id: 't2' }],
      holes: [],
    };
    expect(suggestTierDeescalation(state)).toBe('medium');
  });

  it('returns full when full tier is justified (many tasks)', () => {
    const state = {
      tier: 'full',
      phase_id: 'develop',
      tasks: Array.from({ length: 5 }, (_, i) => ({ id: `t${i}` })),
      holes: [{ id: 'h1' }],
    };
    expect(suggestTierDeescalation(state)).toBe('full');
  });

  it('returns light when medium tier at delivery with no holes', () => {
    const state = {
      tier: 'medium',
      phase_id: 'delivery',
      holes: [],
    };
    expect(suggestTierDeescalation(state)).toBe('light');
  });

  it('returns light when medium tier at complete with no holes', () => {
    const state = {
      tier: 'medium',
      phase_id: 'complete',
      holes: [],
    };
    expect(suggestTierDeescalation(state)).toBe('light');
  });

  it('returns medium when medium tier is still warranted', () => {
    const state = {
      tier: 'medium',
      phase_id: 'develop',
      holes: [{ id: 'h1' }],
    };
    expect(suggestTierDeescalation(state)).toBe('medium');
  });
});

// ─── Fix 2: Artifact quality gate (phase gate section checks) ────────────

describe('checkPhaseGate artifact section verification', () => {
  it('passes when spec.md has all required sections', () => {
    const cwd = makeWorkspace();
    mkdirSync(join(cwd, '.forge'), { recursive: true });
    writeFileSync(
      join(cwd, '.forge', 'spec.md'),
      '# Spec\n\n## Scope\nThe project covers X.\n\n## Constraints\nMust run in <2s.\n\nLorem ipsum dolor sit amet, enough content here.',
    );
    const result = checkPhaseGate(cwd, 'design', 'build');
    // spec.md is a requirement for design phase
    const specMissing = result.missing.filter((m: string) => m.startsWith('spec.md'));
    expect(specMissing).toHaveLength(0);
  });

  it('fails when spec.md is missing ## Scope section', () => {
    const cwd = makeWorkspace();
    mkdirSync(join(cwd, '.forge'), { recursive: true });
    writeFileSync(
      join(cwd, '.forge', 'spec.md'),
      '# Spec\n\n## Constraints\nMust run in <2s.\n\nLorem ipsum dolor sit amet, enough content to pass size check easily here.',
    );
    const result = checkPhaseGate(cwd, 'design', 'build');
    const scopeMissing = result.missing.filter((m: string) => m.includes('missing section matching:') && m.includes('Scope'));
    expect(scopeMissing.length).toBeGreaterThan(0);
    expect(result.canAdvance).toBe(false);
  });

  it('fails when code-rules.md is missing ## Rules section', () => {
    const cwd = makeWorkspace();
    mkdirSync(join(cwd, '.forge'), { recursive: true });
    writeFileSync(
      join(cwd, '.forge', 'code-rules.md'),
      '# Code Rules\n\nSome guidelines here but no Rules heading. Lorem ipsum enough content to pass the size check.',
    );
    // Also create the other required artifacts for plan
    mkdirSync(join(cwd, '.forge', 'design'), { recursive: true });
    mkdirSync(join(cwd, '.forge', 'contracts'), { recursive: true });
    const result = checkPhaseGate(cwd, 'plan', 'build');
    const rulesMissing = result.missing.filter((m: string) => m.includes('missing section matching:'));
    expect(rulesMissing.length).toBeGreaterThan(0);
    expect(result.canAdvance).toBe(false);
  });
});

// ─── Fix 3: Lock contention and session function tests ───────────────────

describe('lock contention', () => {
  it('throws ELOCKED when lock file is fresh (not stale)', () => {
    const cwd = makeWorkspace();
    const lockPath = join(cwd, '.forge', 'forge.lock');
    // Write a lock with the current timestamp (< 5 seconds ago = not stale)
    writeFileSync(lockPath, `99999.${Date.now()}`);

    try {
      updateRuntimeState(cwd, (current: Record<string, unknown>) => ({
        ...current,
        next_session_goal: 'should not succeed',
      }));
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('ELOCKED');
      expect(err.message).toMatch(/lock acquisition failed/i);
    } finally {
      rmSync(lockPath, { force: true });
    }
  });

  it('recovers from a stale lock (>5 seconds old) and completes successfully', () => {
    const cwd = makeWorkspace();
    const lockPath = join(cwd, '.forge', 'forge.lock');
    // Write a lock with a timestamp older than 5 seconds
    const staleTimestamp = Date.now() - 10000;
    writeFileSync(lockPath, `99999.${staleTimestamp}`);

    // Should succeed because the stale lock gets cleaned up
    // Use active_tier since session fields are auto-derived by normalizeRuntimeState
    const result = updateRuntimeState(cwd, (current: Record<string, unknown>) => ({
      ...current,
      active_tier: 'full',
    }));
    expect(result.active_tier).toBe('full');
  });

  it('recovers from a future-dated lock and completes successfully', () => {
    const cwd = makeWorkspace();
    const lockPath = join(cwd, '.forge', 'forge.lock');
    writeFileSync(lockPath, `99999.${Date.now() + 60000}`);

    const result = updateRuntimeState(cwd, (current: Record<string, unknown>) => ({
      ...current,
      active_tier: 'medium',
    }));
    expect(result.active_tier).toBe('medium');
  });

  it('recovers from a malformed lock and completes successfully', () => {
    const cwd = makeWorkspace();
    const lockPath = join(cwd, '.forge', 'forge.lock');
    writeFileSync(lockPath, 'not-a-valid-lock');

    const result = updateRuntimeState(cwd, (current: Record<string, unknown>) => ({
      ...current,
      active_tier: 'medium',
    }));
    expect(result.active_tier).toBe('medium');
  });
});

describe('deriveSessionGoal (tested via readRuntimeState)', () => {
  it('derives discovery session goal from state phase', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Test',
      phase: 'discovery',
      phase_id: 'discovery',
    });
    const runtime = readRuntimeState(cwd);
    expect(runtime.current_session_goal.toLowerCase()).toContain('scope');
  });

  it('derives design session goal from state phase', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Test',
      phase: 'design',
      phase_id: 'design',
      spec_approved: true,
    });
    const runtime = readRuntimeState(cwd);
    expect(runtime.current_session_goal.toLowerCase()).toContain('design');
  });

  it('derives develop session goal from state phase', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Test',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    const runtime = readRuntimeState(cwd);
    expect(runtime.current_session_goal.toLowerCase()).toContain('lane');
  });

  it('derives fix session goal from state phase', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Test',
      phase: 'fix',
      phase_id: 'fix',
    });
    const runtime = readRuntimeState(cwd);
    expect(runtime.current_session_goal.toLowerCase()).toContain('implementation');
  });

  it('derives delivery session goal from state phase', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'Test',
      phase: 'delivery',
      phase_id: 'delivery',
      spec_approved: true,
      design_approved: true,
    });
    const runtime = readRuntimeState(cwd);
    expect(runtime.current_session_goal.toLowerCase()).toContain('delivery');
  });
});

describe('selectContinuationTarget additional cases', () => {
  it('returns phase for qa phase with empty runtime', () => {
    const state = { phase_id: 'qa' };
    const runtime = {
      customer_blockers: [],
      internal_blockers: [],
      lanes: {},
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('phase');
    expect(result.target).toBe('qa');
  });

  it('returns customer_blocker for delivery phase with blockers', () => {
    const state = { phase_id: 'delivery' };
    const runtime = {
      customer_blockers: [{ summary: 'Approve final copy' }],
      internal_blockers: [],
      lanes: {},
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('customer_blocker');
    expect(result.detail).toBe('Approve final copy');
  });

  it('returns internal_blocker with gate owner info', () => {
    const state = { phase_id: 'security' };
    const runtime = {
      customer_blockers: [],
      internal_blockers: [{ summary: 'Secret in config' }],
      active_gate_owner: 'security-reviewer',
      lanes: {},
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('internal_blocker');
    expect(result.detail).toContain('Secret in config');
    expect(result.detail).toContain('security-reviewer');
  });

  it('handles string-type blockers', () => {
    const state = { phase_id: 'develop' };
    const runtime = {
      customer_blockers: ['Need API credentials'],
      internal_blockers: [],
      lanes: {},
    };
    const result = selectContinuationTarget(state, runtime);
    expect(result.kind).toBe('customer_blocker');
    expect(result.detail).toBe('Need API credentials');
  });
});
