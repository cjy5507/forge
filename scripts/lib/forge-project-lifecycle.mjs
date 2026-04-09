import { DEFAULT_RUNTIME } from './forge-io.mjs';

export function setSessionBriefWith(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, {
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
    session_phase_anchor: runtime?.company_phase_anchor || runtime?.session_phase_anchor || '',
    session_gate_anchor: runtime?.active_gate || runtime?.session_gate_anchor || '',
    session_customer_blocker_count: Array.isArray(runtime?.customer_blockers) ? runtime.customer_blockers.length : 0,
    session_internal_blocker_count: Array.isArray(runtime?.internal_blockers) ? runtime.internal_blockers.length : 0,
  });
}

export function writeSessionHandoffWith(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, {
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
    session_phase_anchor: runtime?.company_phase_anchor || runtime?.session_phase_anchor || '',
    session_gate_anchor: runtime?.active_gate || runtime?.session_gate_anchor || '',
    session_customer_blocker_count: Array.isArray(runtime?.customer_blockers) ? runtime.customer_blockers.length : 0,
    session_internal_blocker_count: Array.isArray(runtime?.internal_blockers) ? runtime.internal_blockers.length : 0,
  });
}

export function setCompanyGateWith(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, {
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

export function completeForgeProjectWith({ readForgeState, writeForgeState, updateRuntimeState }, cwd = '.') {
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

  updateRuntimeState(cwd, runtime => ({
    ...runtime,
    delivery_readiness: 'completed',
    active_gate: '',
    active_gate_owner: '',
    current_session_goal: '',
    next_session_goal: '',
  }));

  return updated;
}

export function cancelForgeProjectWith({ readForgeState, writeForgeState, updateRuntimeState }, cwd = '.') {
  const state = readForgeState(cwd);
  if (!state) {
    return null;
  }

  const updated = writeForgeState(cwd, {
    ...state,
    status: 'cancelled',
  });

  updateRuntimeState(cwd, runtime => ({
    ...runtime,
    delivery_readiness: 'cancelled',
    active_gate: '',
    active_gate_owner: '',
    current_session_goal: '',
    next_session_goal: '',
  }));

  return updated;
}

export function isProjectTerminalWith(readForgeState, cwd = '.') {
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
