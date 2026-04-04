import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
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
  normalizeStringList,
} from './forge-io.mjs';
import {
  PHASE_SEQUENCE,
  resolvePhase,
  checkPhaseGate,
} from './forge-phases.mjs';
import {
  normalizeTier,
  inferTierFromState,
  classifyTierFromMessage,
  detectTaskType,
  recommendedAgentsFor,
} from './forge-tiers.mjs';
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

// ─── Internal derive helpers ───────────────────────────────────────────

function deriveSessionOwner({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const activeGate = requireString(runtime?.active_gate);
  const phaseId = state ? resolvePhase(state).id : '';

  if (customerBlockers.length > 0 && !['develop', 'qa', 'security', 'fix'].includes(phaseId)) return 'pm';
  if (activeGate === 'design_readiness') return 'cto';
  if (activeGate === 'implementation_readiness') return 'lead-dev';
  if (activeGate === 'qa') return 'qa';
  if (activeGate === 'security') return 'security-reviewer';
  if (activeGate === 'delivery_readiness' || activeGate === 'customer_review') return 'ceo';
  if (phaseId === 'discovery') return 'pm';
  if (phaseId === 'design') return 'cto';
  if (phaseId === 'develop' || phaseId === 'fix') return 'lead-dev';
  if (phaseId === 'qa') return 'qa';
  if (phaseId === 'security') return 'security-reviewer';
  if (phaseId === 'delivery') return 'ceo';
  return '';
}

function deriveCompanyGateFields({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const observedPhase = state ? resolvePhase(state).id : '';
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const manualGate = runtime?.company_gate_mode === 'manual';
  const phaseAnchor = typeof runtime?.company_phase_anchor === 'string' ? runtime.company_phase_anchor : '';

  if (manualGate && !observedPhase) {
    return {
      company_gate_mode: 'manual',
      company_phase_anchor: phaseAnchor,
      active_gate: typeof runtime?.active_gate === 'string' ? runtime.active_gate : '',
      active_gate_owner: typeof runtime?.active_gate_owner === 'string' ? runtime.active_gate_owner : '',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (manualGate && phaseAnchor === observedPhase) {
    return {
      company_gate_mode: 'manual',
      company_phase_anchor: observedPhase,
      active_gate: typeof runtime?.active_gate === 'string' ? runtime.active_gate : '',
      active_gate_owner: typeof runtime?.active_gate_owner === 'string' ? runtime.active_gate_owner : '',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'discovery') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'spec_readiness',
      active_gate_owner: 'pm',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'design') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'design_readiness',
      active_gate_owner: 'cto',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'develop' || observedPhase === 'fix') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'implementation_readiness',
      active_gate_owner: 'lead-dev',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'qa') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'qa',
      active_gate_owner: 'qa',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'security') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'security',
      active_gate_owner: 'security-reviewer',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'delivery') {
    const readiness = customerBlockers.length > 0
      ? 'in_progress'
      : internalBlockers.length > 0
        ? 'blocked'
        : runtime?.delivery_readiness === 'delivered'
          ? 'delivered'
          : 'ready_for_review';

    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: customerBlockers.length > 0 ? 'customer_review' : 'delivery_readiness',
      active_gate_owner: 'ceo',
      delivery_readiness: readiness,
    };
  }

  if (observedPhase === 'complete') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'customer_review',
      active_gate_owner: 'ceo',
      delivery_readiness: 'delivered',
    };
  }

  return {
    company_gate_mode: manualGate ? 'manual' : 'auto',
    company_phase_anchor: observedPhase,
    active_gate: typeof runtime?.active_gate === 'string' ? runtime.active_gate : '',
    active_gate_owner: typeof runtime?.active_gate_owner === 'string' ? runtime.active_gate_owner : '',
    delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
  };
}

function deriveSessionGoal({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const activeGate = requireString(runtime?.active_gate);
  const readiness = normalizeDeliveryReadiness(runtime?.delivery_readiness);
  const phaseId = state ? resolvePhase(state).id : '';

  if (customerBlockers.length > 0 && !['develop', 'qa', 'security', 'fix'].includes(phaseId)) {
    return `Resolve customer blocker: ${customerBlockers[0].summary}`;
  }
  if (activeGate === 'design_readiness') return 'Close design readiness gate';
  if (activeGate === 'implementation_readiness') return 'Prepare reviewable implementation lanes';
  if (activeGate === 'qa') return 'Clear QA blockers and re-verify';
  if (activeGate === 'security') return 'Clear security blockers and re-check delivery readiness';
  if (activeGate === 'delivery_readiness') {
    return readiness === 'blocked' ? 'Make delivery ready for customer review' : 'Prepare delivery review package';
  }
  if (activeGate === 'customer_review') return 'Present delivery for customer review';
  if (internalBlockers.length > 0) return `Clear internal blocker: ${internalBlockers[0].summary}`;
  if (phaseId === 'discovery') return 'Clarify V1 scope and prepare spec handoff';
  if (phaseId === 'design') return 'Close architecture and design decisions for implementation';
  if (phaseId === 'develop') return 'Advance the next implementation lane';
  if (phaseId === 'fix') return 'Resolve blockers and re-run verification';
  if (phaseId === 'delivery') return 'Prepare final delivery review';
  return '';
}

function deriveSessionExitCriteria({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const activeGate = requireString(runtime?.active_gate);
  const phaseId = state ? resolvePhase(state).id : '';

  if (activeGate === 'design_readiness') return ['architecture approved internally', 'design specs complete', 'technical claims verified'];
  if (activeGate === 'implementation_readiness') return ['lanes defined', 'owners assigned', 'session implementation brief written'];
  if (activeGate === 'qa') return ['QA blockers cleared', 'verification rerun complete'];
  if (activeGate === 'security') return ['security blockers cleared', 'delivery gate re-evaluated'];
  if (activeGate === 'delivery_readiness') return ['blocker count is zero', 'delivery report ready'];
  if (phaseId === 'discovery') return ['critical customer questions resolved', 'spec ready for internal review'];
  if (phaseId === 'develop') return ['current reviewable slice completed', 'next session handoff recorded'];
  return [];
}

function deriveSessionFields({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const observedPhase = state ? resolvePhase(state).id : '';
  const observedGate = requireString(runtime?.active_gate);
  const observedCustomerBlockers = normalizeBlockers(runtime?.customer_blockers).length;
  const observedInternalBlockers = normalizeBlockers(runtime?.internal_blockers).length;
  const briefMode = runtime?.session_brief_mode === 'manual' ? 'manual' : 'auto';
  const phaseAnchor = typeof runtime?.session_phase_anchor === 'string' ? runtime.session_phase_anchor : '';
  const gateAnchor = typeof runtime?.session_gate_anchor === 'string' ? runtime.session_gate_anchor : '';
  const customerAnchor = Number(runtime?.session_customer_blocker_count || 0);
  const internalAnchor = Number(runtime?.session_internal_blocker_count || 0);
  const anchorsMatch =
    briefMode === 'manual' &&
    phaseAnchor === observedPhase &&
    gateAnchor === observedGate &&
    customerAnchor === observedCustomerBlockers &&
    internalAnchor === observedInternalBlockers;

  if (anchorsMatch) {
    return {
      current_session_goal: runtime?.current_session_goal || '',
      session_exit_criteria: normalizeStringList(runtime?.session_exit_criteria),
      next_session_goal: runtime?.next_session_goal || '',
      next_session_owner: runtime?.next_session_owner || '',
      session_handoff_summary: runtime?.session_handoff_summary || '',
      session_brief_mode: 'manual',
      session_phase_anchor: observedPhase,
      session_gate_anchor: observedGate,
      session_customer_blocker_count: observedCustomerBlockers,
      session_internal_blocker_count: observedInternalBlockers,
    };
  }

  const nextOwner = deriveSessionOwner({ state, runtime });
  const goal = deriveSessionGoal({ state, runtime });
  const exitCriteria = deriveSessionExitCriteria({ state, runtime });

  return {
    current_session_goal: goal,
    session_exit_criteria: exitCriteria,
    next_session_goal: goal,
    next_session_owner: nextOwner,
    session_handoff_summary: goal && nextOwner ? `${goal} -> ${nextOwner}` : '',
    session_brief_mode: 'auto',
    session_phase_anchor: observedPhase,
    session_gate_anchor: observedGate,
    session_customer_blocker_count: observedCustomerBlockers,
    session_internal_blocker_count: observedInternalBlockers,
  };
}

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
    stats: mergeStats(state.stats),
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

export function writeForgeState(cwd = '.', state) {
  ensureForgeDir(cwd);
  const normalized = normalizeStateShape(state);
  normalized.updated_at = new Date().toISOString();

  // Phase transition validation: check if the new phase's gate requirements are met
  const phase = resolvePhase(normalized);
  const gateResult = checkPhaseGate(cwd, phase.id, phase.mode);
  if (!gateResult.canAdvance) {
    normalized._phase_gate_warning = `Phase ${phase.id} requires missing artifacts: ${gateResult.missing.join(', ')}`;
  }
  if (phase.mismatch) {
    normalized._phase_mismatch_warning = `Phase "${phase.id}" does not belong to ${phase.mode} sequence — using fallback`;
  }

  writeJsonFile(getStatePath(cwd), normalized);
  const existingRuntime = readJsonFile(getRuntimePath(cwd), DEFAULT_RUNTIME);
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
        // Exponential backoff via Atomics.wait (non-blocking to other threads, no spin)
        const delay = retryDelay * Math.pow(2, attempt) + Math.random() * retryDelay;
        try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay | 0); } catch { /* fallback: no-op */ }
        continue;
      }
      throw err;
    }
  }
  // Fallback: proceed without lock after exhausting retries (log warning)
  try { process.stderr.write(`[Forge] WARNING: lock acquisition failed after ${maxRetries} retries on ${lockPath}, proceeding without lock\n`); } catch {}
  const state = readForgeState(cwd);
  const current = normalizeRuntimeState(
    readJsonFile(runtimePath, DEFAULT_RUNTIME),
    { state },
  );
  const next = updater(current);
  return writeRuntimeState(cwd, next, { state });
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
  const phase = resolvePhase(state);
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
  const spec = state.spec_approved ? '✓spec' : '×spec';
  const design = state.design_approved ? '✓design' : '×design';
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
  const laneSuffix = laneCounts.total ? ` ${laneCounts.merged + laneCounts.done}/${laneCounts.total}l${laneCounts.blocked ? ` ${laneCounts.blocked}b` : ''}${nextLane ? ` ↺${nextLane}${focusHint}` : ''}` : '';
  const mode = state.mode || 'build';
  const seq = phase.sequence || PHASE_SEQUENCE;
  const total = seq.length - 1; // exclude 'complete'

  // Actionable one-liner: most important thing first
  const truncate = (s, max = 50) => s.length > max ? s.slice(0, max - 1) + '…' : s;
  let action = '';
  if (phase.mismatch) {
    action = ` → MISMATCH: "${phase.id}" not in ${phase.mode} sequence`;
  } else if (state._phase_gate_warning) {
    action = ` → GATE: ${truncate(state._phase_gate_warning)}`;
  } else if (customerBlockers.length) {
    action = ` → waiting on client: ${truncate(String(customerBlockers[0]?.summary || customerBlockers[0]))}`;
  } else if (internalBlockers.length) {
    action = ` → blocked: ${truncate(String(internalBlockers[0]?.summary || internalBlockers[0]))}`;
  } else if (deliveryReadiness === 'ready_for_review') {
    action = ' → ready for review';
  } else if (nextLane && focusHint) {
    action = ` → ${nextLane}${focusHint}`;
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

export function messageLooksInteractive(message = '') {
  const text = String(message).toLowerCase();
  const patterns = [
    /\bconfirm\b(?!ed|ing)/,
    /\bapproval\b/,
    /\bapprove\b(?!d)/,
    /\bchoose\b/,
    /\bwhich option\b/,
    /\bwaiting for\b/,
    /\bneed your input\b/,
    /\bdo you want\b/,
    /계속할까요/,
    /확인(?!.*완료)/,
    /선택/,
    /어느/,
    /입력이 필요/,
  ];

  return patterns.some(re => re.test(text));
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

/**
 * Update the claude-hud custom status line with current Forge state.
 * Shows phase, active agents, lanes, and blockers dynamically.
 * Safe to call from any hook — silently no-ops if HUD is not installed.
 */
export function updateHudLine(state, runtime, staleTier = 'fresh') {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) return;
  const hudConfigDir = join(homeDir, '.claude', 'plugins', 'claude-hud');
  const hudConfigPath = join(hudConfigDir, 'config.json');
  if (!existsSync(hudConfigPath) && !existsSync(hudConfigDir)) return;

  let config = {};
  try {
    config = JSON.parse(readFileSync(hudConfigPath, 'utf8'));
  } catch { /* no config yet */ }

  // Use resolvePhase for consistent numbering with compactForgeContext
  const resolved = resolvePhase(state || {});
  const phase = resolved.id;
  const phaseIdx = resolved.index;
  const maxPhase = resolved.sequence.length - 1; // exclude 'complete'

  // For stale projects, show minimal HUD
  if (staleTier === 'stale') {
    const nextLine = 'forge:stale';
    config.display = config.display || {};
    if (config.display.customLine === nextLine) return;
    config.display.customLine = nextLine;
    writeJsonFile(hudConfigPath, config);
    return;
  }

  // Active agents
  const activeAgents = runtime?.active_agents || {};
  const agentEntries = Object.values(activeAgents).filter(a => a.status === 'running');
  const agentInfo = agentEntries.length > 0
    ? agentEntries.map(a => (a.type || 'agent').replace(/^forge:/, '')).join(' ')
    : '';

  // Active lanes
  const lanes = runtime?.lanes || {};
  const allLanes = Object.values(lanes);
  const activeLanes = allLanes.filter(l => l.status !== 'done' && l.status !== 'merged');
  const mergedCount = allLanes.length - activeLanes.length;
  const activeDetail = activeLanes.map(l => `${l.id}(${l.status})`).join(' ');
  const laneInfo = allLanes.length > 0
    ? `${mergedCount}/${allLanes.length}l${activeDetail ? ` ${activeDetail}` : ''}`
    : '';

  const blockers = normalizeBlockers(runtime?.customer_blockers).length + normalizeBlockers(runtime?.internal_blockers).length;

  // Build dynamic line: phase | agents | lanes | blockers
  const parts = [`forge:${phase} ${phaseIdx}/${maxPhase}`];
  if (agentInfo) parts.push(agentInfo);
  if (laneInfo) parts.push(laneInfo);
  parts.push(`${blockers} blockers`);

  const nextLine = parts.join(' | ').slice(0, 80);

  // Only write when the line actually changed to avoid HUD flickering
  config.display = config.display || {};
  if (config.display.customLine === nextLine) return;
  config.display.customLine = nextLine;
  writeJsonFile(hudConfigPath, config);
}
