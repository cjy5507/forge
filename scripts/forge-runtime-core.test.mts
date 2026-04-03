import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import {
  compactForgeContext,
  initLaneRecord,
  markLaneMergeState,
  markLaneReviewState,
  readRuntimeState,
  selectResumeLane,
  setLaneOwner,
  setLaneStatus,
  readForgeState,
  writeForgeState,
  writeRuntimeState,
} from './lib/forge-state.mjs';

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
    expect(rebasing.resume_lane).toBe('api');

    const context = compactForgeContext(readForgeState(root), rebasing);
    expect(context).toContain('↺api');
    expect(context).toContain('rebase');
  });

  it('prioritizes rebasing and changes-requested lanes for resume selection', () => {
    const lane = selectResumeLane({
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
    expect(runtime.resume_lane).toBe('api');
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
    expect(parsed.resume_lane).toBe('api');
    expect(parsed.briefs).toContain('api:changes');
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
  });
});
