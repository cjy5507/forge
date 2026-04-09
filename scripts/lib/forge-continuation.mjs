import {
  DEFAULT_NEXT_ACTION,
  DEFAULT_RUNTIME,
  normalizeAnalysisMeta,
  normalizeNextAction,
} from './forge-io.mjs';
import { resolvePhase } from './forge-phases.mjs';
import {
  normalizeLane,
  normalizeRuntimeLanes,
  selectNextLane,
} from './forge-lanes.mjs';

export function shouldRefreshAnalysis(state = {}, runtime = DEFAULT_RUNTIME, { phaseOverride = '' } = {}) {
  const safeState = state && typeof state === 'object' ? state : {};
  const phase = phaseOverride
    ? resolvePhase({ ...safeState, phase: phaseOverride, phase_id: phaseOverride, phase_name: phaseOverride })
    : resolvePhase(safeState);
  const analysis = normalizeAnalysisMeta(runtime?.analysis || state?.analysis);
  const hasAnalysisRecord = Boolean(
    analysis.last_type ||
    analysis.last_target ||
    analysis.artifact_path ||
    analysis.updated_at,
  );

  const repairAnalysisPhases = new Set(['intake', 'reproduce', 'isolate', 'fix', 'regress', 'verify']);
  if (phase.mode === 'repair' && repairAnalysisPhases.has(phase.id) && !hasAnalysisRecord) {
    return {
      needed: true,
      target: phase.id,
      reason: 'repair flow has no codebase analysis yet',
    };
  }

  if (hasAnalysisRecord && analysis.stale) {
    return {
      needed: true,
      target: analysis.last_target || phase.id,
      reason: 'saved analysis is stale; refresh before continuing',
    };
  }

  return {
    needed: false,
    target: '',
    reason: '',
  };
}

export function selectContinuationTarget(state = {}, runtime = DEFAULT_RUNTIME) {
  const safeState = state && typeof state === 'object' ? state : {};
  const phase = resolvePhase(safeState);
  const allowsLaneContinuation = new Set(['develop', 'fix', 'build']).has(phase.id);
  const customerBlockers = runtime?.customer_blockers;
  const internalBlockers = runtime?.internal_blockers;

  if (Array.isArray(customerBlockers) && customerBlockers.length > 0) {
    const blocker = customerBlockers[0];
    const text = typeof blocker === 'string' ? blocker : (blocker?.summary || String(blocker));
    return {
      kind: 'customer_blocker',
      target: phase.id,
      detail: text,
    };
  }

  if (Array.isArray(internalBlockers) && internalBlockers.length > 0) {
    const blocker = internalBlockers[0];
    const text = typeof blocker === 'string' ? blocker : (blocker?.summary || String(blocker));
    const gateOwner = runtime?.active_gate_owner || '';
    return {
      kind: 'internal_blocker',
      target: phase.id,
      detail: `${text}${gateOwner ? ` (owner: ${gateOwner})` : ''}`,
    };
  }

  const analysisRefresh = shouldRefreshAnalysis(state, runtime);
  if (analysisRefresh.needed) {
    return {
      kind: 'analysis_refresh',
      target: analysisRefresh.target,
      detail: analysisRefresh.reason,
    };
  }

  if (allowsLaneContinuation) {
    const lanes = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}));
    const prioritizedLane = selectNextLane(runtime);
    const prioritizedLaneRecord = prioritizedLane
      ? normalizeLane(runtime?.lanes?.[prioritizedLane], prioritizedLane)
      : null;
    if (prioritizedLaneRecord?.merge_state === 'rebasing' || prioritizedLaneRecord?.review_state === 'changes_requested') {
      return {
        kind: 'next_lane',
        target: prioritizedLane,
        detail: '',
      };
    }

    const mergeReadyLane = lanes.find(
      lane => lane.review_state === 'approved' || lane.merge_state === 'ready' || lane.merge_state === 'queued',
    );
    if (mergeReadyLane) {
      const detail = mergeReadyLane.merge_state === 'queued'
        ? 'queued for merge; land it before starting more work'
        : 'approved and ready to merge; land it before starting more work';
      return {
        kind: 'merge_lane',
        target: mergeReadyLane.id,
        detail,
      };
    }

    const activeWithHandoff = lanes.find(
      lane => lane.status === 'in_progress' && lane.handoff_notes && lane.handoff_notes.length > 0,
    );
    if (activeWithHandoff) {
      const lastNote = activeWithHandoff.handoff_notes[activeWithHandoff.handoff_notes.length - 1];
      return {
        kind: 'active_lane',
        target: activeWithHandoff.id,
        detail: typeof lastNote === 'string' ? lastNote : (lastNote?.note || lastNote?.text || ''),
      };
    }

    const nextLane = selectNextLane(runtime);
    if (nextLane) {
      return {
        kind: 'next_lane',
        target: nextLane,
        detail: '',
      };
    }
  }

  return {
    kind: 'phase',
    target: phase.id,
    detail: '',
  };
}

function isDeliveredProject(state = {}, runtime = DEFAULT_RUNTIME) {
  const safeState = state && typeof state === 'object' ? state : {};
  const phase = resolvePhase(safeState);
  return String(safeState.status || '').toLowerCase() === 'delivered'
    || String(runtime?.delivery_readiness || '').toLowerCase() === 'delivered'
    || phase.id === 'complete';
}

export function selectResumeSkill(state = {}, runtime = DEFAULT_RUNTIME) {
  if (isDeliveredProject(state, runtime)) {
    return {
      skill: 'info',
      reason: 'project is already delivered',
      continuation: {
        kind: 'complete',
        target: 'complete',
        detail: 'project is already delivered',
      },
    };
  }

  const continuation = selectContinuationTarget(state, runtime);
  if (continuation.kind === 'analysis_refresh') {
    return {
      skill: 'analyze',
      reason: continuation.detail,
      continuation,
    };
  }

  return {
    skill: 'continue',
    reason: continuation.detail || '',
    continuation,
  };
}

export function deriveNextAction(state = {}, runtime = DEFAULT_RUNTIME) {
  const safeState = state && typeof state === 'object' ? state : {};
  if (isDeliveredProject(safeState, runtime)) {
    return normalizeNextAction({
      ...DEFAULT_NEXT_ACTION,
      kind: 'complete',
      skill: 'info',
      target: 'complete',
      reason: '',
      summary: 'Project delivered',
      updated_at: new Date().toISOString(),
    });
  }

  const resume = selectResumeSkill(safeState, runtime);
  const continuation = resume.continuation || { kind: '', target: '', detail: '' };
  const now = new Date().toISOString();
  let summary = '';

  if (resume.skill === 'analyze') {
    summary = `Run forge:analyze first${resume.reason ? ` — ${resume.reason}` : ''}`;
  } else if (continuation.kind === 'customer_blocker') {
    summary = `Resolve customer blocker${continuation.detail ? ` — ${continuation.detail}` : ''}`;
  } else if (continuation.kind === 'internal_blocker') {
    summary = `Clear internal blocker${continuation.detail ? ` — ${continuation.detail}` : ''}`;
  } else if (continuation.kind === 'merge_lane') {
    summary = `Merge lane ${continuation.target}${continuation.detail ? ` — ${continuation.detail}` : ''}`;
  } else if (continuation.kind === 'active_lane') {
    summary = `Finish lane ${continuation.target}${continuation.detail ? ` — ${continuation.detail}` : ''}`;
  } else if (continuation.kind === 'next_lane') {
    const lane = continuation.target ? normalizeLane(runtime?.lanes?.[continuation.target], continuation.target) : null;
    if (lane?.merge_state === 'rebasing') {
      summary = `Rebase lane ${continuation.target}`;
    } else if (lane?.review_state === 'changes_requested') {
      summary = `Revise lane ${continuation.target}`;
    } else if (lane?.status === 'in_review') {
      summary = `Review lane ${continuation.target}`;
    } else if (lane?.status === 'pending' || lane?.status === 'ready') {
      summary = `Start lane ${continuation.target}`;
    } else {
      summary = `Finish lane ${continuation.target}`;
    }
  } else if (continuation.kind === 'phase') {
    summary = `Continue phase ${continuation.target}`;
  }

  return normalizeNextAction({
    ...DEFAULT_NEXT_ACTION,
    kind: continuation.kind || '',
    skill: resume.skill || '',
    target: continuation.target || '',
    reason: resume.reason || continuation.detail || '',
    summary,
    updated_at: now,
  });
}
