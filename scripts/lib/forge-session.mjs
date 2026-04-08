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
  normalizeDecisionTrace,
  normalizeHostContext,
  normalizeHarnessPolicy,
  normalizeNextAction,
  normalizeRecoveryState,
  normalizeToolingState,
  normalizeVerificationState,
  sanitizeJsonValue,
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
  const source = sanitizeJsonValue(runtime && typeof runtime === 'object' ? runtime : {});
  const normalized = {
    ...DEFAULT_RUNTIME,
    ...source,
    active_tier: normalizeTier(source.active_tier || 'light'),
    company_mode: normalizeCompanyMode(source.company_mode),
    company_gate_mode: source.company_gate_mode === 'manual' ? 'manual' : 'auto',
    company_phase_anchor: typeof source.company_phase_anchor === 'string' ? source.company_phase_anchor : '',
    active_gate: typeof source.active_gate === 'string' ? source.active_gate : '',
    active_gate_owner: typeof source.active_gate_owner === 'string' ? source.active_gate_owner : '',
    delivery_readiness: normalizeDeliveryReadiness(source.delivery_readiness),
    customer_blockers: normalizeBlockers(source.customer_blockers),
    internal_blockers: normalizeBlockers(source.internal_blockers),
    current_session_goal: typeof source.current_session_goal === 'string' ? source.current_session_goal : '',
    session_exit_criteria: normalizeStringList(source.session_exit_criteria),
    next_session_goal: typeof source.next_session_goal === 'string' ? source.next_session_goal : '',
    next_session_owner: typeof source.next_session_owner === 'string' ? source.next_session_owner : '',
    session_handoff_summary: typeof source.session_handoff_summary === 'string' ? source.session_handoff_summary : '',
    session_brief_mode: source.session_brief_mode === 'manual' ? 'manual' : 'auto',
    session_phase_anchor: typeof source.session_phase_anchor === 'string' ? source.session_phase_anchor : '',
    session_gate_anchor: typeof source.session_gate_anchor === 'string' ? source.session_gate_anchor : '',
    session_customer_blocker_count: Number(source.session_customer_blocker_count || 0),
    session_internal_blocker_count: Number(source.session_internal_blocker_count || 0),
    recommended_agents: Array.isArray(source.recommended_agents) ? source.recommended_agents : [],
    active_agents: source.active_agents && typeof source.active_agents === 'object' ? source.active_agents : {},
    recent_agents: Array.isArray(source.recent_agents) ? source.recent_agents : [],
    recent_failures: Array.isArray(source.recent_failures) ? source.recent_failures : [],
    analysis: normalizeAnalysisMeta(source.analysis),
    next_action: normalizeNextAction(source.next_action),
    host_context: normalizeHostContext(source.host_context),
    harness_policy: normalizeHarnessPolicy(source.harness_policy),
    decision_trace: normalizeDecisionTrace(source.decision_trace),
    verification: normalizeVerificationState(source.verification),
    recovery: normalizeRecoveryState(source.recovery),
    tooling: normalizeToolingState(source.tooling),
    lanes: normalizeRuntimeLanes(source.lanes || {}),
    stop_guard: {
      ...DEFAULT_RUNTIME.stop_guard,
      ...(source.stop_guard || {}),
    },
    stats: mergeStats(source.stats),
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
  const source = sanitizeJsonValue(state && typeof state === 'object' ? state : {});
  const phase = resolvePhase(source);
  const status = typeof source.status === 'string' ? source.status : 'pending';
  const tier = normalizeTier(source.tier ?? inferTierFromState(source));

  return {
    ...source,
    phase: phase.id,
    phase_id: phase.id,
    phase_index: phase.index,
    phase_name: phase.label,
    status,
    tier,
    mode: typeof source.mode === 'string' ? source.mode : 'build',
    agents_active: Array.isArray(source.agents_active) ? source.agents_active : [],
    tasks: Array.isArray(source.tasks) ? source.tasks : [],
    holes: Array.isArray(source.holes) ? source.holes : [],
    pr_queue: Array.isArray(source.pr_queue) ? source.pr_queue : [],
    analysis: normalizeAnalysisMeta(source.analysis),
    harness_policy: normalizeHarnessPolicy(source.harness_policy),
    stats: mergeStats(source.stats),
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

/**
 * Persist a deterministic decision-trace record into runtime.json.
 * This is additive metadata for explainability and replay inspection.
 * @param {string} [cwd]
 * @param {{ scope?: string, kind?: string, target?: string, summary?: string, inputs?: string[], policySnapshot?: string, at?: string }} [decision]
 */
export function recordDecisionTrace(cwd = '.', decision = {}) {
  const state = readForgeState(cwd);
  const runtime = readRuntimeState(cwd, { state });
  const harnessPolicy = normalizeHarnessPolicy(runtime?.harness_policy || state?.harness_policy || {});
  const entry = normalizeDecisionTrace({
    latest: {
      at: decision.at || new Date().toISOString(),
      scope: decision.scope || '',
      kind: decision.kind || '',
      target: decision.target || '',
      summary: decision.summary || '',
      inputs: Array.isArray(decision.inputs) ? decision.inputs : [],
      policy_snapshot: decision.policySnapshot || `${harnessPolicy.strictness_mode}/${harnessPolicy.verification_mode}/${harnessPolicy.host_posture}`,
    },
    recent: [
      {
        at: decision.at || new Date().toISOString(),
        scope: decision.scope || '',
        kind: decision.kind || '',
        target: decision.target || '',
        summary: decision.summary || '',
        inputs: Array.isArray(decision.inputs) ? decision.inputs : [],
        policy_snapshot: decision.policySnapshot || `${harnessPolicy.strictness_mode}/${harnessPolicy.verification_mode}/${harnessPolicy.host_posture}`,
      },
      ...(runtime?.decision_trace?.recent || []),
    ],
  });

  const nextState = state
    ? writeForgeState(cwd, {
      ...state,
      harness_policy: harnessPolicy,
    })
    : null;

  const nextRuntime = writeRuntimeState(cwd, {
    ...runtime,
    harness_policy: harnessPolicy,
    decision_trace: entry,
    last_event: {
      name: 'record-decision-trace',
      lane: '',
      at: entry.latest?.at || new Date().toISOString(),
    },
  }, { state: nextState || state });

  return {
    state: nextState,
    runtime: nextRuntime,
    decision_trace: entry,
  };
}

export function recordVerificationState(cwd = '.', verification = {}) {
  const state = readForgeState(cwd);
  const runtime = readRuntimeState(cwd, { state });
  const nextVerification = normalizeVerificationState({
    ...(runtime?.verification || {}),
    ...verification,
  });

  const nextRuntime = writeRuntimeState(cwd, {
    ...runtime,
    verification: nextVerification,
    last_event: {
      name: 'record-verification-state',
      lane: '',
      at: nextVerification.updated_at || new Date().toISOString(),
    },
  }, { state });

  return {
    runtime: nextRuntime,
    verification: nextVerification,
  };
}

export function recordRecoveryState(cwd = '.', recoveryEntry = {}) {
  const state = readForgeState(cwd);
  const runtime = readRuntimeState(cwd, { state });
  const existing = normalizeRecoveryState(runtime?.recovery || {});
  const now = recoveryEntry.at || new Date().toISOString();
  const id = recoveryEntry.id || `${recoveryEntry.category || 'failure'}:${recoveryEntry.lane_id || ''}:${recoveryEntry.command || ''}`;
  const nextRecovery = normalizeRecoveryState({
    latest: {
      id,
      at: now,
      category: recoveryEntry.category || '',
      lane_id: recoveryEntry.lane_id || '',
      phase_id: recoveryEntry.phase_id || '',
      command: recoveryEntry.command || '',
      guidance: recoveryEntry.guidance || '',
      suggested_command: recoveryEntry.suggested_command || '',
      retry_count: recoveryEntry.retry_count || 0,
      status: recoveryEntry.status || 'active',
      summary: recoveryEntry.summary || '',
    },
    active: [
      {
        id,
        at: now,
        category: recoveryEntry.category || '',
        lane_id: recoveryEntry.lane_id || '',
        phase_id: recoveryEntry.phase_id || '',
        command: recoveryEntry.command || '',
        guidance: recoveryEntry.guidance || '',
        suggested_command: recoveryEntry.suggested_command || '',
        retry_count: recoveryEntry.retry_count || 0,
        status: recoveryEntry.status || 'active',
        summary: recoveryEntry.summary || '',
      },
      ...existing.active.filter(item => item.id !== id),
    ],
  });

  const nextRuntime = writeRuntimeState(cwd, {
    ...runtime,
    recovery: nextRecovery,
    last_event: {
      name: 'record-recovery-state',
      lane: recoveryEntry.lane_id || '',
      at: now,
    },
  }, { state });

  return {
    runtime: nextRuntime,
    recovery: nextRecovery,
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
