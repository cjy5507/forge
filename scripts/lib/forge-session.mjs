import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_ANALYSIS,
  DEFAULT_NEXT_ACTION,
  DEFAULT_RUNTIME,
  DEFAULT_STATS,
  requireString,
  ensureForgeDir,
  resolveForgeBaseDir,
  readJsonFile,
  writeJsonFile,
  getStatePath,
  getRuntimePath,
  mergeStats,
  normalizeCompanyMode,
  normalizeDeliveryReadiness,
  normalizeBlockers,
  normalizeAnalysisMeta,
  normalizeNextAction,
  normalizeStringList,
} from './forge-io.mjs';
import {
  PHASE_SEQUENCE,
  resolvePhase,
  checkPhaseGate,
  validatePhaseTransition,
  getPhaseSequence,
} from './forge-phases.mjs';
import {
  normalizeTier,
  inferTierFromState,
  classifyTierFromMessage,
  detectTaskType,
  recommendedAgentsFor,
} from './forge-tiers.mjs';
import { allTriggers, INTERACTIVE_PATTERNS } from './i18n-patterns.mjs';
import {
  normalizeLane,
  normalizeLaneStatus,
  normalizeLaneReviewState,
  normalizeLaneMergeState,
  normalizeRuntimeLanes,
  summarizeLaneCounts,
  selectNextLane,
  syncActiveWorktreesFromLanes,
  normalizeHandoffNotes,
  appendLaneNote,
} from './forge-lanes.mjs';

// ─── Re-export extracted modules for backward compatibility ───────────
export {
  deriveSessionOwner,
  deriveCompanyGateFields,
  deriveSessionGoal,
  deriveSessionExitCriteria,
  deriveSessionFields,
} from './forge-derive.mjs';

export { updateHudLine } from './forge-hud.mjs';

// Import derive helpers for internal use
import {
  deriveCompanyGateFields,
  deriveSessionFields,
} from './forge-derive.mjs';

// Import HUD helper for internal use
import { updateHudLine } from './forge-hud.mjs';

// ─── normalizeRuntimeState (central orchestrator) ──────────────────────

export function normalizeRuntimeState(runtime = DEFAULT_RUNTIME, { state = null } = {}) {
  const normalized = {
    ...DEFAULT_RUNTIME,
    ...(runtime || {}),
    active_tier: normalizeTier(runtime?.active_tier || 'light'),
    company_mode: normalizeCompanyMode(runtime?.company_mode),
    company_gate_mode: runtime?.company_gate_mode === 'manual' ? 'manual' : 'auto',
    company_phase_anchor: typeof runtime?.company_phase_anchor === 'string' ? runtime.company_phase_anchor : '',
    active_gate: typeof runtime?.active_gate === 'string' ? runtime.active_gate : '',
    active_gate_owner: typeof runtime?.active_gate_owner === 'string' ? runtime.active_gate_owner : '',
    delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    customer_blockers: normalizeBlockers(runtime?.customer_blockers),
    internal_blockers: normalizeBlockers(runtime?.internal_blockers),
    current_session_goal: typeof runtime?.current_session_goal === 'string' ? runtime.current_session_goal : '',
    session_exit_criteria: normalizeStringList(runtime?.session_exit_criteria),
    next_session_goal: typeof runtime?.next_session_goal === 'string' ? runtime.next_session_goal : '',
    next_session_owner: typeof runtime?.next_session_owner === 'string' ? runtime.next_session_owner : '',
    session_handoff_summary: typeof runtime?.session_handoff_summary === 'string' ? runtime.session_handoff_summary : '',
    session_brief_mode: runtime?.session_brief_mode === 'manual' ? 'manual' : 'auto',
    session_phase_anchor: typeof runtime?.session_phase_anchor === 'string' ? runtime.session_phase_anchor : '',
    session_gate_anchor: typeof runtime?.session_gate_anchor === 'string' ? runtime.session_gate_anchor : '',
    session_customer_blocker_count: Number(runtime?.session_customer_blocker_count || 0),
    session_internal_blocker_count: Number(runtime?.session_internal_blocker_count || 0),
    recommended_agents: Array.isArray(runtime?.recommended_agents) ? runtime.recommended_agents : [],
    active_agents: runtime?.active_agents && typeof runtime.active_agents === 'object' ? runtime.active_agents : {},
    recent_agents: Array.isArray(runtime?.recent_agents) ? runtime.recent_agents : [],
    recent_failures: Array.isArray(runtime?.recent_failures) ? runtime.recent_failures : [],
    analysis: normalizeAnalysisMeta(runtime?.analysis),
    next_action: normalizeNextAction(runtime?.next_action),
    lanes: normalizeRuntimeLanes(runtime?.lanes || {}),
    stop_guard: {
      ...DEFAULT_RUNTIME.stop_guard,
      ...(runtime?.stop_guard || {}),
    },
    stats: mergeStats(runtime?.stats),
  };

  Object.assign(normalized, deriveCompanyGateFields({ state, runtime: normalized }));
  Object.assign(normalized, deriveSessionFields({ state, runtime: normalized }));

  normalized.active_worktrees = syncActiveWorktreesFromLanes(normalized);
  normalized.next_lane = selectNextLane({
    ...normalized,
    active_worktrees: normalized.active_worktrees,
  });
  normalized.next_action = deriveNextAction(state || {}, normalized);
  return normalized;
}

// ─── State shape normalization ─────────────────────────────────────────

export function normalizeStateShape(state = {}) {
  const phase = resolvePhase(state);
  const status = typeof state.status === 'string' ? state.status : 'pending';
  const tier = normalizeTier(state.tier ?? inferTierFromState(state));

  return {
    ...state,
    phase: phase.id,
    phase_id: phase.id,
    phase_index: phase.index,
    phase_name: phase.label,
    status,
    tier,
    mode: typeof state.mode === 'string' ? state.mode : 'build',
    agents_active: Array.isArray(state.agents_active) ? state.agents_active : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    holes: Array.isArray(state.holes) ? state.holes : [],
    pr_queue: Array.isArray(state.pr_queue) ? state.pr_queue : [],
    analysis: normalizeAnalysisMeta(state.analysis),
    stats: mergeStats(state.stats),
  };
}

export function recordAnalysisMetadata(cwd = '.', analysis = {}) {
  const state = readForgeState(cwd);
  const runtime = readRuntimeState(cwd);
  const nextAnalysis = normalizeAnalysisMeta({
    ...DEFAULT_ANALYSIS,
    ...state?.analysis,
    ...runtime?.analysis,
    ...analysis,
    updated_at: analysis.updated_at || new Date().toISOString(),
  });

  const nextState = state ? writeForgeState(cwd, {
    ...state,
    analysis: nextAnalysis,
  }) : null;

  const nextRuntime = writeRuntimeState(cwd, {
    ...runtime,
    analysis: nextAnalysis,
    last_event: {
      name: 'record-analysis',
      lane: '',
      at: nextAnalysis.updated_at,
    },
  }, { state: nextState || state });

  return {
    state: nextState,
    runtime: nextRuntime,
    analysis: nextAnalysis,
  };
}

// ─── State read/write ──────────────────────────────────────────────────

export function readForgeState(cwd = '.') {
  const raw = readJsonFile(getStatePath(cwd));
  if (!raw) {
    return null;
  }

  return normalizeStateShape(raw);
}

export function writeForgeState(cwd = '.', state, { allowRollback = false } = {}) {
  ensureForgeDir(cwd);
  const normalized = normalizeStateShape(state);
  normalized.updated_at = new Date().toISOString();

  // Phase transition validation: check forward/backward
  const previousState = readJsonFile(getStatePath(cwd));
  if (previousState) {
    const prevPhase = resolvePhase(previousState);
    const nextPhase = resolvePhase(normalized);
    const transition = validatePhaseTransition(prevPhase.id, nextPhase.id, nextPhase.mode, { allowRollback });
    if (!transition.valid) {
      normalized._phase_transition_warning = transition.reason;
      process.stderr.write(`[Forge] warning: ${transition.reason}\n`);
      // Auto-correct: keep previous phase (degraded mode — don't block, just warn)
      normalized.phase = prevPhase.id;
      normalized.phase_id = prevPhase.id;
      normalized.phase_index = prevPhase.index;
      normalized.phase_name = prevPhase.label;
    }
  }

  // Phase gate validation: check if the new phase's gate requirements are met
  const phase = resolvePhase(normalized);
  const gateResult = checkPhaseGate(cwd, phase.id, phase.mode);
  if (!gateResult.canAdvance) {
    normalized._phase_gate_warning = `Phase ${phase.id} requires missing artifacts: ${gateResult.missing.join(', ')}`;
  }
  if (phase.mismatch) {
    normalized._phase_mismatch_warning = `Phase "${phase.id}" does not belong to ${phase.mode} sequence — using fallback`;
  }

  // Cross-consistency validation
  const existingRuntime = readJsonFile(getRuntimePath(cwd), DEFAULT_RUNTIME);
  const consistency = validateStateConsistency(normalized, existingRuntime);
  if (consistency.corrections.length > 0) {
    for (const c of consistency.corrections) {
      process.stderr.write(`[Forge] auto-correct: ${c}\n`);
    }
    Object.assign(existingRuntime, consistency.runtimeFixes);
  }

  writeJsonFile(getStatePath(cwd), normalized);
  writeRuntimeState(cwd, existingRuntime);
  return normalized;
}

export function readRuntimeState(cwd = '.') {
  return normalizeRuntimeState(
    readJsonFile(getRuntimePath(cwd), DEFAULT_RUNTIME),
    { state: readForgeState(cwd) },
  );
}

export function writeRuntimeState(cwd = '.', runtime, { state = undefined } = {}) {
  ensureForgeDir(cwd);
  const next = {
    ...normalizeRuntimeState(runtime, { state: state !== undefined ? state : readForgeState(cwd) }),
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(getRuntimePath(cwd), next);
  return next;
}

export function updateRuntimeState(cwd = '.', updater) {
  const runtimePath = getRuntimePath(cwd);
  const lockPath = `${runtimePath}.lock`;
  const maxRetries = 5;
  const retryDelay = 50;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      writeFileSync(lockPath, `${process.pid}.${Date.now()}`, { flag: 'wx' });
      try {
        const state = readForgeState(cwd);
        const current = normalizeRuntimeState(
          readJsonFile(runtimePath, DEFAULT_RUNTIME),
          { state },
        );
        const next = updater(current);
        return writeRuntimeState(cwd, next, { state });
      } finally {
        try { unlinkSync(lockPath); } catch {}
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        // No .forge/ directory — proceed without lock (no project active)
        const state = readForgeState(cwd);
        const current = normalizeRuntimeState(
          readJsonFile(runtimePath, DEFAULT_RUNTIME),
          { state },
        );
        const next = updater(current);
        return writeRuntimeState(cwd, next, { state });
      }
      if (err.code === 'EEXIST') {
        // Lock held — check staleness (>5s = stale)
        try {
          const lockContent = readFileSync(lockPath, 'utf8');
          const parts = lockContent.split('.');
          const lockTimestamp = parts.length >= 2 ? parseInt(parts[1], 10) : NaN;
          if (!Number.isFinite(lockTimestamp) || Date.now() - lockTimestamp > 5000) {
            try { unlinkSync(lockPath); } catch {}
          }
        } catch {}
        // Synchronous sleep via Atomics.wait — SharedArrayBuffer is always available in Node.js
        // (unlike browsers which require cross-origin isolation). This avoids busy-wait spinning.
        const delay = retryDelay * Math.pow(2, attempt) + Math.random() * retryDelay;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay | 0);
        continue;
      }
      throw err;
    }
  }

  const error = new Error(`Forge runtime lock acquisition failed after ${maxRetries} retries: ${lockPath}`);
  error.code = 'ELOCKED';
  throw error;
}

export function recordStateStats(cwd = '.', updater) {
  const state = readForgeState(cwd);
  if (!state) {
    return null;
  }

  const next = updater(state.stats || mergeStats());
  return writeForgeState(cwd, {
    ...state,
    stats: mergeStats(next),
  });
}

// ─── Lane mutation functions ───────────────────────────────────────────

function mutateLane(runtime = DEFAULT_RUNTIME, laneId, updater) {
  const normalizedRuntime = normalizeRuntimeState(runtime);
  const lane = normalizeLane(normalizedRuntime.lanes[laneId], laneId);
  const nextLane = normalizeLane(updater(lane), laneId);

  return normalizeRuntimeState({
    ...normalizedRuntime,
    lanes: {
      ...normalizedRuntime.lanes,
      [laneId]: nextLane,
    },
  });
}

export function initLaneRecord(runtime = DEFAULT_RUNTIME, {
  laneId,
  title = '',
  worktreePath = '',
  taskFile = '',
  reviewer = '',
  dependencies = [],
  requirementRefs = [],
  acceptanceRefs = [],
  evidenceRefs = [],
} = {}) {
  const now = new Date().toISOString();
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    id: laneId,
    title: title || lane.title || laneId,
    worktree_path: worktreePath || lane.worktree_path,
    task_file: taskFile || lane.task_file,
    reviewer: reviewer || lane.reviewer,
    dependencies: dependencies.length ? dependencies.map(String) : lane.dependencies,
    requirement_refs: requirementRefs.length ? requirementRefs.map(String) : lane.requirement_refs,
    acceptance_refs: acceptanceRefs.length ? acceptanceRefs.map(String) : lane.acceptance_refs,
    evidence_refs: evidenceRefs.length ? evidenceRefs.map(String) : lane.evidence_refs,
    status: lane.status === 'pending' && lane.title === 'unnamed lane' ? 'pending' : lane.status,
    last_event_at: now,
  }));
}

export function setLaneOwner(runtime = DEFAULT_RUNTIME, {
  laneId,
  ownerRole = 'developer',
  ownerAgentId = '',
  ownerAgentType = '',
} = {}) {
  const now = new Date().toISOString();
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    owner_role: ownerRole || lane.owner_role,
    owner_agent_id: ownerAgentId || lane.owner_agent_id,
    owner_agent_type: ownerAgentType || lane.owner_agent_type,
    last_event_at: now,
  }));
}

export function recordLaneHandoff(runtime = DEFAULT_RUNTIME, {
  laneId,
  note,
  kind = 'handoff',
} = {}) {
  const now = new Date().toISOString();
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, kind, note, now),
    last_event_at: now,
  }));
}

export function setLaneStatus(runtime = DEFAULT_RUNTIME, {
  laneId,
  status,
  note = '',
} = {}) {
  const now = new Date().toISOString();
  const nextStatus = normalizeLaneStatus(status);
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    status: nextStatus,
    blocked_reason: nextStatus === 'blocked' ? (note || lane.blocked_reason) : '',
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, 'status', note, now),
    review_state: nextStatus === 'in_review' && lane.review_state === 'none' ? 'pending' : lane.review_state,
    merge_state: nextStatus === 'merged' ? 'merged' : lane.merge_state,
    last_event_at: now,
  }));
}

export function markLaneReviewState(runtime = DEFAULT_RUNTIME, {
  laneId,
  reviewState,
  note = '',
} = {}) {
  const now = new Date().toISOString();
  const nextReviewState = normalizeLaneReviewState(reviewState);
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    review_state: nextReviewState,
    status: nextReviewState === 'none' ? lane.status : 'in_review',
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, 'review', note, now),
    last_event_at: now,
  }));
}

export function markLaneMergeState(runtime = DEFAULT_RUNTIME, {
  laneId,
  mergeState,
  note = '',
} = {}) {
  const now = new Date().toISOString();
  const nextMergeState = normalizeLaneMergeState(mergeState);
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    merge_state: nextMergeState,
    status: nextMergeState === 'merged' ? 'merged' : lane.status,
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, 'merge', note, now),
    last_event_at: now,
  }));
}

// ─── Session continuity ────────────────────────────────────────────────

export function selectContinuationTarget(state = {}, runtime = DEFAULT_RUNTIME) {
  const safeState = state && typeof state === 'object' ? state : {};
  const phase = resolvePhase(safeState);
  const customerBlockers = runtime?.customer_blockers;
  const internalBlockers = runtime?.internal_blockers;

  // Priority 1: Customer blocker — needs user input
  if (Array.isArray(customerBlockers) && customerBlockers.length > 0) {
    const blocker = customerBlockers[0];
    const text = typeof blocker === 'string' ? blocker : (blocker?.summary || String(blocker));
    return {
      kind: 'customer_blocker',
      target: phase.id,
      detail: text,
    };
  }

  // Priority 2: Internal blocker — route to owning team
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

  // Priority 3: In-progress lane with handoff notes
  const lanes = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}));
  const activeWithHandoff = lanes.find(
    lane => lane.status === 'in_progress' && lane.handoff_notes && lane.handoff_notes.length > 0
  );
  if (activeWithHandoff) {
    const lastNote = activeWithHandoff.handoff_notes[activeWithHandoff.handoff_notes.length - 1];
    return {
      kind: 'active_lane',
      target: activeWithHandoff.id,
      detail: typeof lastNote === 'string' ? lastNote : (lastNote?.note || lastNote?.text || ''),
    };
  }

  // Priority 4: Designated next lane
  const nextLane = selectNextLane(runtime);
  if (nextLane) {
    return {
      kind: 'next_lane',
      target: nextLane,
      detail: '',
    };
  }

  // Priority 5: Phase fallback
  return {
    kind: 'phase',
    target: phase.id,
    detail: '',
  };
}

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
  } else if (continuation.kind === 'active_lane') {
    summary = `Resume lane ${continuation.target}${continuation.detail ? ` — ${continuation.detail}` : ''}`;
  } else if (continuation.kind === 'next_lane') {
    summary = `Continue lane ${continuation.target}`;
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

export function setSessionBrief(runtime = DEFAULT_RUNTIME, {
  currentSessionGoal = '',
  sessionExitCriteria = [],
  nextSessionGoal = '',
  nextSessionOwner = '',
  sessionHandoffSummary = '',
} = {}) {
  return normalizeRuntimeState({
    ...runtime,
    current_session_goal: currentSessionGoal || runtime?.current_session_goal || '',
    session_exit_criteria: sessionExitCriteria.length ? sessionExitCriteria : runtime?.session_exit_criteria || [],
    next_session_goal: nextSessionGoal || runtime?.next_session_goal || '',
    next_session_owner: nextSessionOwner || runtime?.next_session_owner || '',
    session_handoff_summary: sessionHandoffSummary || runtime?.session_handoff_summary || '',
    session_brief_mode: 'manual',
  });
}

export function writeSessionHandoff(runtime = DEFAULT_RUNTIME, {
  summary,
  nextSessionGoal = '',
  nextSessionOwner = '',
} = {}) {
  return normalizeRuntimeState({
    ...runtime,
    session_handoff_summary: summary || runtime?.session_handoff_summary || '',
    next_session_goal: nextSessionGoal || runtime?.next_session_goal || '',
    next_session_owner: nextSessionOwner || runtime?.next_session_owner || '',
    session_brief_mode: 'manual',
  });
}

export function setCompanyGate(runtime = DEFAULT_RUNTIME, {
  activeGate = '',
  activeGateOwner = '',
  deliveryReadiness = '',
  customerBlockers = null,
  internalBlockers = null,
  phaseAnchor = '',
} = {}) {
  return normalizeRuntimeState({
    ...runtime,
    company_gate_mode: 'manual',
    company_phase_anchor: phaseAnchor || runtime?.company_phase_anchor || '',
    active_gate: activeGate || runtime?.active_gate || '',
    active_gate_owner: activeGateOwner || runtime?.active_gate_owner || '',
    delivery_readiness: deliveryReadiness || runtime?.delivery_readiness || 'unknown',
    customer_blockers: customerBlockers ?? runtime?.customer_blockers ?? [],
    internal_blockers: internalBlockers ?? runtime?.internal_blockers ?? [],
  });
}

export function compactForgeContext(state, runtime = DEFAULT_RUNTIME) {
  if (!state) {
    return '[Forge] light idle';
  }

  const phase = resolvePhase(state);
  const spec = state.spec_approved ? '\u2713spec' : '\u00d7spec';
  const design = state.design_approved ? '\u2713design' : '\u00d7design';
  const tier = normalizeTier(runtime?.active_tier || state.tier || inferTierFromState(state));
  const companyMode = normalizeCompanyMode(runtime?.company_mode);
  const activeGate = requireString(runtime?.active_gate);
  const deliveryReadiness = normalizeDeliveryReadiness(runtime?.delivery_readiness);
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const currentSessionGoal = requireString(runtime?.current_session_goal);
  const nextSessionOwner = requireString(runtime?.next_session_owner);
  const agentCount = Array.isArray(runtime?.recommended_agents) ? runtime.recommended_agents.length : 0;
  const laneCounts = summarizeLaneCounts(runtime);
  const nextLane = selectNextLane(runtime);
  const nextLaneRecord = nextLane ? normalizeLane(runtime?.lanes?.[nextLane], nextLane) : null;
  let focusHint = '';
  if (nextLaneRecord?.merge_state === 'rebasing') {
    focusHint = ' rebase';
  } else if (nextLaneRecord?.review_state === 'changes_requested') {
    focusHint = ' review!';
  } else if (nextLaneRecord?.status === 'in_review') {
    focusHint = ' review';
  }
  if (nextLaneRecord?.model_hint) {
    focusHint += `[${nextLaneRecord.model_hint}]`;
  }
  const companySuffix = [
    companyMode === 'autonomous_company' ? 'auto' : '',
    activeGate ? `gate:${activeGate}` : '',
    customerBlockers.length ? `c${customerBlockers.length}` : '',
    internalBlockers.length ? `i${internalBlockers.length}` : '',
    currentSessionGoal ? 'goal' : '',
    nextSessionOwner ? `next:${nextSessionOwner}` : '',
    deliveryReadiness === 'ready_for_review' ? 'deliver!' : '',
    deliveryReadiness === 'blocked' ? 'hold' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const laneSuffix = laneCounts.total ? ` ${laneCounts.merged + laneCounts.done}/${laneCounts.total}l${laneCounts.blocked ? ` ${laneCounts.blocked}b` : ''}${nextLane ? ` \u21ba${nextLane}${focusHint}` : ''}` : '';
  const mode = state.mode || 'build';
  const seq = phase.sequence || PHASE_SEQUENCE;
  const total = seq.length - 1; // exclude 'complete'

  // Actionable one-liner: most important thing first
  const truncate = (s, max = 50) => s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
  let action = '';
  if (phase.mismatch) {
    action = ` \u2192 MISMATCH: "${phase.id}" not in ${phase.mode} sequence`;
  } else if (state._phase_gate_warning) {
    action = ` \u2192 GATE: ${truncate(state._phase_gate_warning)}`;
  } else if (customerBlockers.length) {
    action = ` \u2192 waiting on client: ${truncate(String(customerBlockers[0]?.summary || customerBlockers[0]))}`;
  } else if (internalBlockers.length) {
    action = ` \u2192 blocked: ${truncate(String(internalBlockers[0]?.summary || internalBlockers[0]))}`;
  } else if (deliveryReadiness === 'ready_for_review') {
    action = ' \u2192 ready for review';
  } else if (nextLane && focusHint) {
    action = ` \u2192 ${nextLane}${focusHint}`;
  }

  return `[Forge] ${mode} ${tier} ${phase.id} ${phase.index}/${total} ${spec} ${design}${companySuffix ? ` ${companySuffix}` : ''}${agentCount ? ` ${agentCount}a` : ''}${laneSuffix}${action}`;
}

export function summarizePendingWork(state, runtime = null) {
  if (!state) {
    return [];
  }

  const phase = resolvePhase(state);
  const pending = [];

  if (state.mode !== 'repair' && !state.spec_approved && phase.index >= PHASE_SEQUENCE.indexOf('design')) {
    pending.push('spec');
  }

  if (state.mode !== 'repair' && !state.design_approved && phase.index >= PHASE_SEQUENCE.indexOf('develop')) {
    pending.push('design');
  }

  if ((state.holes?.length || 0) > 0 && phase.id !== 'complete') {
    pending.push(`${state.holes.length} holes`);
  }

  if ((state.tasks?.length || 0) > 0 && phase.id === 'develop') {
    pending.push(`${state.tasks.length} tasks`);
  }

  if (runtime) {
    const laneCounts = summarizeLaneCounts(runtime);
    if (laneCounts.total > 0 && phase.id !== 'complete') {
      pending.push(`${laneCounts.total} lane${laneCounts.total === 1 ? '' : 's'}`);
      if (laneCounts.blocked > 0) {
        pending.push(`${laneCounts.blocked} blocked`);
      }
    }
  }

  if ((state.pr_queue?.length || 0) > 0) {
    pending.push(`${state.pr_queue.length} prs`);
  }

  if (phase.id !== 'complete' && pending.length === 0) {
    pending.push(phase.id);
  }

  return pending;
}

const interactivePatterns = allTriggers(INTERACTIVE_PATTERNS);

export function messageLooksInteractive(message = '') {
  const text = String(message).toLowerCase();
  return interactivePatterns.some(re => re.test(text));
}

export function isProjectActive(state) {
  if (!state) {
    return false;
  }

  const status = String(state.status || '').toLowerCase();
  if (['complete', 'delivered', 'cancelled', 'canceled'].includes(status)) {
    return false;
  }

  return resolvePhase(state).id !== 'complete';
}

export function updateAdaptiveTier(cwd = '.', { state = null, message = '' } = {}) {
  const inferredTier = classifyTierFromMessage(message, state);
  const taskType = detectTaskType(message);
  const phaseId = state ? resolvePhase(state).id : 'develop';
  const currentRuntime = readRuntimeState(cwd);
  const recommendedAgents = recommendedAgentsFor({ tier: inferredTier, taskType, phaseId, runtime: currentRuntime });

  const runtime = updateRuntimeState(cwd, current => ({
    ...current,
    active_tier: inferredTier,
    last_task_type: taskType,
    recommended_agents: recommendedAgents,
    stats: {
      ...current.stats,
      started_at: current.stats.started_at || new Date().toISOString(),
      last_prompt_at: new Date().toISOString(),
    },
  }));

  return {
    tier: inferredTier,
    taskType,
    recommendedAgents,
    runtime,
  };
}

// ─── Cross-consistency validation ─────────────────────────────────────

/**
 * Validate that state.json and runtime.json are not contradictory.
 * Returns { valid, corrections[], runtimeFixes }.
 * Never throws — logs warnings and returns auto-corrections (degraded mode).
 */
export function validateStateConsistency(state, runtime) {
  const corrections = [];
  const runtimeFixes = {};

  if (!state || !runtime) {
    return { valid: true, corrections, runtimeFixes };
  }

  const phase = resolvePhase(state);
  const sequence = getPhaseSequence(phase.mode);
  const phaseIndex = sequence.indexOf(phase.id);
  const deliveryIndex = sequence.indexOf('delivery');
  const delivery = runtime.delivery_readiness;

  // Rule 1: early phase + delivered = contradiction
  // Express uses 'ship' instead of 'delivery'; check both
  const latePhaseIndex = deliveryIndex !== -1 ? deliveryIndex : sequence.indexOf('ship');
  if (delivery === 'delivered' && latePhaseIndex !== -1 && phaseIndex < latePhaseIndex) {
    corrections.push(`phase=${phase.id} but delivery_readiness=delivered — resetting to in_progress`);
    runtimeFixes.delivery_readiness = 'in_progress';
  }

  // Rule 2: phase=complete but status=active = contradiction
  if (phase.id === 'complete' && state.status === 'active') {
    corrections.push(`phase=complete but status=active — should be completed`);
    // This is a state fix, but we only fix runtime here; caller handles state
  }

  // Rule 3: status=completed/cancelled but phase not complete
  if ((state.status === 'completed' || state.status === 'cancelled') && phase.id !== 'complete') {
    corrections.push(`status=${state.status} but phase=${phase.id} — setting delivery_readiness`);
    runtimeFixes.delivery_readiness = state.status === 'completed' ? 'completed' : 'cancelled';
  }

  return {
    valid: corrections.length === 0,
    corrections,
    runtimeFixes,
  };
}

// ─── Project completion/cancellation ──────────────────────────────────

/**
 * Mark a Forge project as completed.
 * Sets status='completed', phase='complete', delivery_readiness='completed'.
 */
export function completeForgeProject(cwd = '.') {
  const state = readForgeState(cwd);
  if (!state) {
    return null;
  }

  const updated = writeForgeState(cwd, {
    ...state,
    status: 'completed',
    phase: 'complete',
    phase_id: 'complete',
    phase_name: 'complete',
  });

  updateRuntimeState(cwd, (runtime) => ({
    ...runtime,
    delivery_readiness: 'completed',
    active_gate: '',
    active_gate_owner: '',
    current_session_goal: '',
    next_session_goal: '',
  }));

  return updated;
}

/**
 * Mark a Forge project as cancelled.
 * Sets status='cancelled', preserves current phase for history.
 */
export function cancelForgeProject(cwd = '.') {
  const state = readForgeState(cwd);
  if (!state) {
    return null;
  }

  const updated = writeForgeState(cwd, {
    ...state,
    status: 'cancelled',
  });

  updateRuntimeState(cwd, (runtime) => ({
    ...runtime,
    delivery_readiness: 'cancelled',
    active_gate: '',
    active_gate_owner: '',
    current_session_goal: '',
    next_session_goal: '',
  }));

  return updated;
}

/**
 * Check if a project is in a terminal state (completed or cancelled).
 * Used by forge:continue to detect stale projects.
 */
export function isProjectTerminal(cwd = '.') {
  const state = readForgeState(cwd);
  if (!state) {
    return { terminal: false, reason: 'no project' };
  }

  if (state.status === 'completed') {
    return { terminal: true, reason: 'completed', project: state.project };
  }
  if (state.status === 'cancelled') {
    return { terminal: true, reason: 'cancelled', project: state.project };
  }
  if (state.phase === 'complete' || state.phase_id === 'complete') {
    return { terminal: true, reason: 'phase complete', project: state.project };
  }

  return { terminal: false, reason: 'active', project: state.project };
}
