import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_ANALYSIS,
  DEFAULT_RUNTIME,
  mergeStats,
  normalizeCompanyMode,
  normalizeDeliveryReadiness,
  normalizeBlockers,
  normalizeAnalysisMeta,
  normalizeHostContext,
  normalizeNextAction,
  normalizeStringList,
} from './forge-io.mjs';
import {
  resolvePhase,
} from './forge-phases.mjs';
import {
  normalizeTier,
  inferTierFromState,
} from './forge-tiers.mjs';
import {
  normalizeRuntimeLanes,
  summarizeLaneCounts,
  selectNextLane,
  syncActiveWorktreesFromLanes,
} from './forge-lanes.mjs';
import { deriveNextAction } from './forge-continuation.mjs';
import { compactForgeContext, summarizePendingWork } from './forge-compact-context.mjs';
import { validateStateConsistency } from './forge-state-trust.mjs';
import { createStateStore } from './forge-state-store.mjs';
import {
  initLaneRecordWith,
  markLaneMergeStateWith,
  markLaneReviewStateWith,
  recordLaneHandoffWith,
  setLaneOwnerWith,
  setLaneStatusWith,
} from './forge-lane-control.mjs';
import {
  cancelForgeProjectWith,
  completeForgeProjectWith,
  isProjectTerminalWith,
  setCompanyGateWith,
  setSessionBriefWith,
  writeSessionHandoffWith,
} from './forge-project-lifecycle.mjs';
import {
  isProjectActive,
  messageLooksInteractive,
  updateAdaptiveTierWith,
} from './forge-interaction.mjs';

/** @typedef {import('../../types/forge-state').ForgeAnalysisMeta} ForgeAnalysisMeta */
/** @typedef {import('../../types/forge-state').ForgeRuntime} ForgeRuntime */
/** @typedef {import('../../types/forge-state').ForgeState} ForgeState */

// ─── Re-export extracted modules for backward compatibility ───────────
export {
  deriveSessionOwner,
  deriveCompanyGateFields,
  deriveSessionGoal,
  deriveSessionExitCriteria,
  deriveSessionFields,
} from './forge-derive.mjs';

export { updateHudLine } from './forge-hud.mjs';
export {
  deriveNextAction,
  selectContinuationTarget,
  selectResumeSkill,
  shouldRefreshAnalysis,
} from './forge-continuation.mjs';
export { compactForgeContext, summarizePendingWork } from './forge-compact-context.mjs';
export { isProjectActive, messageLooksInteractive } from './forge-interaction.mjs';
export { validateStateConsistency } from './forge-state-trust.mjs';

// Import derive helpers for internal use
import {
  deriveCompanyGateFields,
  deriveSessionFields,
} from './forge-derive.mjs';

// Import HUD helper for internal use
import { updateHudLine } from './forge-hud.mjs';

// ─── normalizeRuntimeState (central orchestrator) ──────────────────────

/**
 * Normalize runtime.json into the canonical Forge runtime contract.
 * @param {Partial<ForgeRuntime>|null|undefined} [runtime]
 * @param {{ state?: Partial<ForgeState>|null }} [options]
 * @returns {ForgeRuntime}
 */
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
    host_context: normalizeHostContext(runtime?.host_context),
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

/**
 * Normalize state.json into the canonical Forge state contract.
 * @param {Partial<ForgeState>|null|undefined} [state]
 * @returns {ForgeState}
 */
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

const {
  readForgeState,
  writeForgeState,
  readRuntimeState,
  writeRuntimeState,
  updateRuntimeState,
  updateRuntimeHookContext,
  recordStateStats,
} = createStateStore({
  normalizeStateShape,
  normalizeRuntimeState,
});

export {
  readForgeState,
  writeForgeState,
  readRuntimeState,
  writeRuntimeState,
  updateRuntimeState,
  updateRuntimeHookContext,
  recordStateStats,
};

/**
 * Persist analysis metadata into both state.json and runtime.json.
 * @param {string} [cwd]
 * @param {Partial<ForgeAnalysisMeta>|Record<string, unknown>} [analysis]
 */
export function recordAnalysisMetadata(cwd = '.', analysis = {}) {
  const state = readForgeState(cwd);
  const runtime = readRuntimeState(cwd, { state });
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

// ─── Lane mutation functions ───────────────────────────────────────────

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
  return initLaneRecordWith(normalizeRuntimeState, runtime, {
    laneId,
    title,
    worktreePath,
    taskFile,
    reviewer,
    dependencies,
    requirementRefs,
    acceptanceRefs,
    evidenceRefs,
  });
}

export function setLaneOwner(runtime = DEFAULT_RUNTIME, {
  laneId,
  ownerRole = 'developer',
  ownerAgentId = '',
  ownerAgentType = '',
} = {}) {
  return setLaneOwnerWith(normalizeRuntimeState, runtime, {
    laneId,
    ownerRole,
    ownerAgentId,
    ownerAgentType,
  });
}

export function recordLaneHandoff(runtime = DEFAULT_RUNTIME, {
  laneId,
  note,
  kind = 'handoff',
} = {}) {
  return recordLaneHandoffWith(normalizeRuntimeState, runtime, {
    laneId,
    note,
    kind,
  });
}

export function setLaneStatus(runtime = DEFAULT_RUNTIME, {
  laneId,
  status,
  note = '',
} = {}) {
  return setLaneStatusWith(normalizeRuntimeState, runtime, {
    laneId,
    status,
    note,
  });
}

export function markLaneReviewState(runtime = DEFAULT_RUNTIME, {
  laneId,
  reviewState,
  note = '',
} = {}) {
  return markLaneReviewStateWith(normalizeRuntimeState, runtime, {
    laneId,
    reviewState,
    note,
  });
}

export function markLaneMergeState(runtime = DEFAULT_RUNTIME, {
  laneId,
  mergeState,
  note = '',
} = {}) {
  return markLaneMergeStateWith(normalizeRuntimeState, runtime, {
    laneId,
    mergeState,
    note,
  });
}

export function setSessionBrief(runtime = DEFAULT_RUNTIME, {
  currentSessionGoal = '',
  sessionExitCriteria = [],
  nextSessionGoal = '',
  nextSessionOwner = '',
  sessionHandoffSummary = '',
} = {}) {
  return setSessionBriefWith(normalizeRuntimeState, runtime, {
    currentSessionGoal,
    sessionExitCriteria,
    nextSessionGoal,
    nextSessionOwner,
    sessionHandoffSummary,
  });
}

export function writeSessionHandoff(runtime = DEFAULT_RUNTIME, {
  summary,
  nextSessionGoal = '',
  nextSessionOwner = '',
} = {}) {
  return writeSessionHandoffWith(normalizeRuntimeState, runtime, {
    summary,
    nextSessionGoal,
    nextSessionOwner,
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
  return setCompanyGateWith(normalizeRuntimeState, runtime, {
    activeGate,
    activeGateOwner,
    deliveryReadiness,
    customerBlockers,
    internalBlockers,
    phaseAnchor,
  });
}

export function updateAdaptiveTier(cwd = '.', { state = null, message = '', hostId = '', eventName = '' } = {}) {
  return updateAdaptiveTierWith({ readRuntimeState, updateRuntimeState }, cwd, {
    state,
    message,
    hostId,
    eventName,
  });
}

// ─── Project completion/cancellation ──────────────────────────────────

/**
 * Mark a Forge project as completed.
 * Sets status='completed', phase='complete', delivery_readiness='completed'.
 */
export function completeForgeProject(cwd = '.') {
  return completeForgeProjectWith({ readForgeState, writeForgeState, updateRuntimeState }, cwd);
}

/**
 * Mark a Forge project as cancelled.
 * Sets status='cancelled', preserves current phase for history.
 */
export function cancelForgeProject(cwd = '.') {
  return cancelForgeProjectWith({ readForgeState, writeForgeState, updateRuntimeState }, cwd);
}

/**
 * Check if a project is in a terminal state (completed or cancelled).
 * Used by forge:continue to detect stale projects.
 */
export function isProjectTerminal(cwd = '.') {
  return isProjectTerminalWith(readForgeState, cwd);
}
