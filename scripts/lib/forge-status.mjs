import { spawnSync } from 'child_process';
import { basename } from 'path';
import { readForgeState, readRuntimeState, resolvePhase, normalizeRuntimeState, summarizeLaneCounts, normalizeRuntimeLanes } from './forge-state.mjs';
import { readHoleSummaries, scopeHoleSummariesToProject, summarizeHoles } from './forge-delivery-report.mjs';

const PHASE_LABELS = {
  intake: 'Intake',
  discovery: 'Discovery',
  design: 'Design',
  develop: 'Development',
  qa: 'QA',
  security: 'Security',
  fix: 'Fix Loop',
  delivery: 'Delivery',
  reproduce: 'Reproduce',
  isolate: 'Isolate',
  regress: 'Regress',
  verify: 'Verify',
  plan: 'Plan',
  build: 'Build',
  ship: 'Ship',
  complete: 'Complete',
};

function progressBar(ratio, width = 20) {
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function phaseProgress(phase, runtime) {
  const buildRanges = {
    intake: [0, 12],
    discovery: [12, 25],
    design: [25, 40],
    develop: [40, 70],
    qa: [70, 80],
    security: [80, 90],
    fix: [90, 95],
    delivery: [95, 100],
    complete: [100, 100],
  };
  const repairRanges = {
    intake: [0, 12],
    reproduce: [12, 25],
    isolate: [25, 50],
    fix: [50, 70],
    regress: [70, 80],
    verify: [80, 90],
    delivery: [90, 100],
    complete: [100, 100],
  };
  const expressRanges = {
    plan: [0, 33],
    build: [33, 80],
    ship: [80, 100],
    complete: [100, 100],
  };

  const ranges = phase.mode === 'repair'
    ? repairRanges
    : phase.mode === 'express'
      ? expressRanges
      : buildRanges;
  const [start, end] = ranges[phase.id] || [0, 100];

  if (phase.id === 'develop' || phase.id === 'build') {
    const counts = summarizeLaneCounts(runtime);
    if (counts.total > 0) {
      const doneRatio = (counts.done + counts.merged) / counts.total;
      return start + Math.round((end - start) * doneRatio);
    }
  }

  return start;
}

function getLatestForgeTag(cwd = '.') {
  const result = spawnSync('git', ['tag', '-l', 'forge/*', '--sort=-version:refname'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return '';
  }

  return String(result.stdout || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)[0] || '';
}

export function buildStatusModel({
  cwd = '.',
  state = undefined,
  runtime = undefined,
  holeSummary = undefined,
  latestTag = undefined,
} = {}) {
  const currentState = state ?? readForgeState(cwd);
  if (!currentState) {
    return null;
  }

  const currentRuntime = normalizeRuntimeState(runtime ?? readRuntimeState(cwd), { state: currentState });
  const phase = resolvePhase(currentState);
  const counts = summarizeLaneCounts(currentRuntime);
  const scopedHoles = scopeHoleSummariesToProject(readHoleSummaries(cwd), currentState);
  const holes = holeSummary ?? summarizeHoles(scopedHoles);
  const tag = latestTag ?? getLatestForgeTag(cwd);
  const pct = phaseProgress(phase, currentRuntime);
  const total = phase.sequence.length - 1;
  const nextAction = currentRuntime.next_action || {};
  const lanes = Object.values(normalizeRuntimeLanes(currentRuntime.lanes || {}))
    .filter(lane => lane.status !== 'done' && lane.status !== 'merged');
  const rebasingLanes = lanes.filter(lane => lane.merge_state === 'rebasing');
  const reviewFixLanes = lanes.filter(lane => lane.review_state === 'changes_requested');
  const mergeReadyLanes = lanes.filter(
    lane => lane.review_state === 'approved' || lane.merge_state === 'ready' || lane.merge_state === 'queued',
  );

  let supportSummary = '';
  if (currentRuntime.customer_blockers?.length) {
    const blocker = currentRuntime.customer_blockers[0];
    supportSummary = `Waiting on you: ${blocker.summary || blocker}`;
  } else if (currentRuntime.internal_blockers?.length) {
    const blocker = currentRuntime.internal_blockers[0];
    supportSummary = `Blocked: ${blocker.summary || blocker} (owner: ${currentRuntime.active_gate_owner || 'unknown'})`;
  } else if (currentRuntime.delivery_readiness === 'delivered' || phase.id === 'complete') {
    supportSummary = 'Delivered';
  } else if (currentRuntime.delivery_readiness === 'ready_for_review') {
    supportSummary = 'Ready for review — run forge deliver to finalize';
  } else if (rebasingLanes.length > 0) {
    supportSummary = `Rebase now: ${rebasingLanes.map(lane => lane.id).join(', ')}.`;
  } else if (reviewFixLanes.length > 0) {
    supportSummary = `Review changes requested: ${reviewFixLanes.map(lane => lane.id).join(', ')}.`;
  } else if (mergeReadyLanes.length > 0) {
    supportSummary = `Merge now: ${mergeReadyLanes.map(lane => lane.id).join(', ')}.`;
  } else if (counts.in_progress > 0) {
    const activeNames = lanes.filter(lane => lane.status === 'in_progress').map(lane => lane.id);
    supportSummary = `Active: ${activeNames.join(', ')}.`;
  } else {
    supportSummary = `Phase ${PHASE_LABELS[phase.id] || phase.id} in progress`;
  }

  const laneDetails = lanes.map(lane => {
    const lastNote = lane.handoff_notes?.[lane.handoff_notes.length - 1];
    const noteText = lastNote?.note ? ` — ${lastNote.note}` : '';
    if (lane.merge_state === 'rebasing') {
      return `${lane.id} (${lane.owner_role || '?'}, rebasing)${noteText}`;
    }
    if (lane.review_state === 'changes_requested') {
      return `${lane.id} (${lane.owner_role || '?'}, changes_requested)${noteText}`;
    }
    if (lane.review_state === 'approved' || lane.merge_state === 'ready') {
      return `${lane.id} (${lane.owner_role || '?'}, merge-ready)${noteText}`;
    }
    if (lane.merge_state === 'queued') {
      return `${lane.id} (${lane.owner_role || '?'}, queued-for-merge)${noteText}`;
    }
    if (lane.status === 'blocked') {
      return `${lane.id} (${lane.owner_role || '?'}, blocked) — ${lane.blocked_reason || 'no reason'}`;
    }
    return `${lane.id} (${lane.owner_role || '?'}, ${lane.status})${noteText}`;
  });

  return {
    project: currentState.project || basename(cwd),
    mode: currentState.mode || 'build',
    phase_id: phase.id,
    phase_name: PHASE_LABELS[phase.id] || phase.id,
    phase_index: phase.index,
    total_phases: total,
    progress_percent: pct,
    progress_bar: progressBar(pct / 100),
    next_action: nextAction,
    support_summary: supportSummary,
    lanes: {
      total: counts.total,
      done: counts.done + counts.merged,
      blocked: counts.blocked,
      details: laneDetails,
    },
    issues: {
      blocker: holes.blockerCount,
      major: holes.majorCount,
      minor: holes.minorCount,
      total: holes.blockerCount + holes.majorCount + holes.minorCount,
    },
    tag,
    harness: {
      tier: currentRuntime.active_tier || currentState.tier || 'light',
      sessions: currentRuntime.stats?.session_count || 0,
      agents: currentRuntime.stats?.agent_calls || 0,
      failures: currentRuntime.stats?.failure_count || 0,
      stops: currentRuntime.stats?.stop_block_count || 0,
    },
  };
}

export function renderStatusText(model, { verbose = false } = {}) {
  if (!model) {
    return 'No active Forge project. Use `forge` to start one.\n';
  }

  const lines = [
    `Forge: ${model.project} (${model.mode})`,
    `Phase ${model.phase_index}/${model.total_phases} — ${model.phase_name}`,
    `${model.progress_bar} ${model.progress_percent}%`,
    '',
  ];

  if (model.next_action?.summary) {
    lines.push(`Next action: ${model.next_action.summary}`);
  }
  if (model.support_summary) {
    lines.push(model.support_summary);
  }

  lines.push('');
  lines.push(`Lanes: ${model.lanes.done}/${model.lanes.total} done${model.lanes.blocked ? `, ${model.lanes.blocked} blocked` : ''}`);
  lines.push(`Issues: ${model.issues.blocker} blocker, ${model.issues.major} major, ${model.issues.minor} minor`);
  if (model.tag) {
    lines.push(`Tag: ${model.tag}`);
  }
  lines.push('');
  lines.push(`Harness: tier=${model.harness.tier} sessions=${model.harness.sessions} agents=${model.harness.agents} failures=${model.harness.failures} stops=${model.harness.stops}`);

  if (verbose && model.lanes.details.length > 0) {
    lines.push('');
    for (const detail of model.lanes.details) {
      lines.push(detail);
    }
  }

  return `${lines.join('\n')}\n`;
}
