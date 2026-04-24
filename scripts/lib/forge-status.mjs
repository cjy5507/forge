import { spawnSync } from 'child_process';
import { basename } from 'path';
import { describeCrossHostResume } from './forge-host.mjs';
import { buildHealthReport } from './forge-health.mjs';
import { readForgeState, readRuntimeState, normalizeRuntimeState } from './forge-session.mjs';
import { getCompletionBlockers } from './forge-continuation.mjs';
import { getStateTrustWarnings } from './forge-state-trust.mjs';
import { resolvePhase } from './forge-phases.mjs';
import { summarizeLaneCounts, normalizeRuntimeLanes } from './forge-lanes.mjs';
import { readHoleSummaries, scopeHoleSummariesToProject, summarizeHoles } from './forge-delivery-report.mjs';

const PHASE_LABELS = {
  intake: 'Intake',
  discovery: 'Discovery',
  design: 'Design',
  plan: 'Plan',
  develop: 'Development',
  qa: 'QA',
  security: 'Security',
  fix: 'Fix Loop',
  delivery: 'Delivery',
  reproduce: 'Reproduce',
  isolate: 'Isolate',
  regress: 'Regress',
  verify: 'Verify',
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
    plan: [40, 55],
    develop: [55, 70],
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

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function selectHostSupportWarning(health) {
  if (!health?.host) {
    return '';
  }
  if (health.host.support_level === 'degraded') {
    return health.warnings.find(warning => warning.includes('degraded mode')) || '';
  }
  if (health.host.support_level === 'unknown') {
    return health.warnings.find(warning => warning.includes('unknown to Forge')) || '';
  }
  if (health.host.missing_package_paths?.length) {
    return health.warnings.find(warning => warning.includes('Missing packaged host surfaces')) || '';
  }
  return '';
}

export function buildStatusModel({
  cwd = '.',
  state = undefined,
  runtime = undefined,
  holeSummary = undefined,
  latestTag = undefined,
} = {}) {
  const trustWarnings = getStateTrustWarnings(cwd);
  const currentState = state ?? readForgeState(cwd);
  if (!currentState) {
    if (trustWarnings.length === 0) {
      return null;
    }

    return {
      project: basename(cwd),
      mode: 'unknown',
      phase_id: 'warning',
      phase_name: 'State Warning',
      phase_index: 0,
      total_phases: 0,
      progress_percent: 0,
      progress_bar: progressBar(0),
      next_action: {
        skill: 'continue',
        summary: 'Repair Forge state files before continuing',
      },
      support_summary: '',
      lanes: { total: 0, done: 0, blocked: 0, details: [] },
      issues: { blocker: 0, major: 0, minor: 0, total: 0 },
      tag: '',
      harness: { tier: 'unknown', sessions: 0, agents: 0, failures: 0, stops: 0 },
      host_handoff: '',
      state_trust_warnings: trustWarnings,
    };
  }

  const currentRuntime = normalizeRuntimeState(runtime ?? readRuntimeState(cwd, { state: currentState }), { state: currentState });
  const health = buildHealthReport({
    cwd,
    state: currentState,
    runtime: currentRuntime,
  });
  const phase = resolvePhase(currentState);
  const counts = summarizeLaneCounts(currentRuntime);
  const scopedHoles = scopeHoleSummariesToProject(readHoleSummaries(cwd), currentState);
  const holes = holeSummary ?? summarizeHoles(scopedHoles);
  const tag = latestTag ?? getLatestForgeTag(cwd);
  const pct = phaseProgress(phase, currentRuntime);
  const total = phase.sequence.length - 1;
  const nextAction = currentRuntime.next_action || {};
  const hostHandoff = describeCrossHostResume(currentRuntime);
  const lanes = Object.values(normalizeRuntimeLanes(currentRuntime.lanes || {}))
    .filter(lane => lane.status !== 'done' && lane.status !== 'merged');
  const rebasingLanes = lanes.filter(lane => lane.merge_state === 'rebasing');
  const reviewFixLanes = lanes.filter(lane => lane.review_state === 'changes_requested');
  const mergeReadyLanes = lanes.filter(
    lane => lane.review_state === 'approved' || lane.merge_state === 'ready' || lane.merge_state === 'queued',
  );
  const completionBlockers = getCompletionBlockers(currentState, currentRuntime);
  const verificationStatus = String(currentRuntime.verification?.status || '').toLowerCase();
  const recoveryStatus = String(currentRuntime.recovery?.latest?.status || '').toLowerCase();

  let supportSummary = '';
  if (currentRuntime.customer_blockers?.length) {
    const blocker = currentRuntime.customer_blockers[0];
    supportSummary = `Waiting on you: ${blocker.summary || blocker}`;
  } else if (currentRuntime.internal_blockers?.length) {
    const blocker = currentRuntime.internal_blockers[0];
    supportSummary = `Blocked: ${blocker.summary || blocker} (owner: ${currentRuntime.active_gate_owner || 'unknown'})`;
  } else if (verificationStatus === 'failed') {
    supportSummary = `Verification failed${currentRuntime.verification?.summary ? `: ${currentRuntime.verification.summary}` : ''}`;
  } else if (['active', 'escalated'].includes(recoveryStatus)) {
    supportSummary = `Recovery ${recoveryStatus}${currentRuntime.recovery?.latest?.summary ? `: ${currentRuntime.recovery.latest.summary}` : ''}`;
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
  } else if (lanes.length > 0) {
    supportSummary = `Unfinished lanes: ${lanes.map(lane => lane.id).join(', ')}.`;
  } else if (currentRuntime.delivery_readiness === 'delivered' || phase.id === 'complete') {
    supportSummary = completionBlockers.length > 0
      ? `Completion blocked: ${completionBlockers.join(', ')}`
      : 'Delivered';
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
      policy: currentRuntime.harness_policy || currentState.harness_policy || {},
      latest_decision: currentRuntime.decision_trace?.latest || null,
      verification: currentRuntime.verification || null,
      recovery: currentRuntime.recovery || null,
      sessions: currentRuntime.stats?.session_count || 0,
      agents: currentRuntime.stats?.agent_calls || 0,
      failures: currentRuntime.stats?.failure_count || 0,
      stops: currentRuntime.stats?.stop_block_count || 0,
    },
    host_support_warning: selectHostSupportWarning(health),
    host_handoff: hostHandoff,
    state_trust_warnings: uniqueStrings([
      ...trustWarnings,
      ...(currentState._trust_warnings || []),
      ...(currentRuntime._trust_warnings || []),
    ]),
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
  if (model.host_handoff) {
    lines.push(model.host_handoff);
  }
  if (model.host_support_warning) {
    lines.push(`Host support: ${model.host_support_warning}`);
  }
  if (Array.isArray(model.state_trust_warnings) && model.state_trust_warnings.length > 0) {
    lines.push(`State trust: ${model.state_trust_warnings.join(' | ')}`);
  }

  lines.push('');
  lines.push(`Lanes: ${model.lanes.done}/${model.lanes.total} done${model.lanes.blocked ? `, ${model.lanes.blocked} blocked` : ''}`);
  lines.push(`Issues: ${model.issues.blocker} blocker, ${model.issues.major} major, ${model.issues.minor} minor`);
  if (model.tag) {
    lines.push(`Tag: ${model.tag}`);
  }
  lines.push('');
  lines.push(`Harness: tier=${model.harness.tier} sessions=${model.harness.sessions} agents=${model.harness.agents} failures=${model.harness.failures} stops=${model.harness.stops}`);
  if (model.harness.policy?.strictness_mode) {
    lines.push(`Policy: ${model.harness.policy.strictness_mode}/${model.harness.policy.verification_mode}/${model.harness.policy.host_posture}`);
  }
  if (model.harness.verification?.status) {
    lines.push(`Verification: ${model.harness.verification.status}${model.harness.verification.summary ? ` — ${model.harness.verification.summary}` : ''}`);
  }
  if (model.harness.recovery?.latest?.status) {
    lines.push(`Recovery: ${model.harness.recovery.latest.status}${model.harness.recovery.latest.summary ? ` — ${model.harness.recovery.latest.summary}` : ''}`);
  }

  if (verbose && model.lanes.details.length > 0) {
    lines.push('');
    for (const detail of model.lanes.details) {
      lines.push(detail);
    }
  }
  if (verbose && model.harness.latest_decision?.summary) {
    lines.push('');
    lines.push(`Latest decision: ${model.harness.latest_decision.summary}`);
  }

  return `${lines.join('\n')}\n`;
}
