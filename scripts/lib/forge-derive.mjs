// Forge Derive — extracted session derivation helpers
// These functions compute derived fields for runtime state based on phase, gates, and blockers.

import {
  DEFAULT_RUNTIME,
  requireString,
  normalizeDeliveryReadiness,
  normalizeBlockers,
  normalizeStringList,
} from './forge-io.mjs';
import { resolvePhase } from './forge-phases.mjs';

// ─── Phase-to-gate mapping table ──────────────────────────────────────

const PHASE_GATE_MAP = {
  discovery: { gate: 'spec_readiness', owner: 'pm' },
  design: { gate: 'design_readiness', owner: 'cto' },
  plan: { gate: 'plan_readiness', owner: 'lead-dev' },
  develop: { gate: 'implementation_readiness', owner: 'lead-dev' },
  fix: { gate: 'implementation_readiness', owner: 'lead-dev' },
  qa: { gate: 'qa', owner: 'qa' },
  security: { gate: 'security', owner: 'security-reviewer' },
  // delivery and complete are special — handled separately due to readiness states
};

// ─── Internal derive helpers ───────────────────────────────────────────

export function deriveSessionOwner({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const activeGate = requireString(runtime?.active_gate);
  const phaseId = state ? resolvePhase(state).id : '';

  if (customerBlockers.length > 0 && !['develop', 'qa', 'security', 'fix'].includes(phaseId)) return 'pm';
  if (activeGate === 'design_readiness') return 'cto';
  if (activeGate === 'plan_readiness') return 'lead-dev';
  if (activeGate === 'implementation_readiness') return 'lead-dev';
  if (activeGate === 'qa') return 'qa';
  if (activeGate === 'security') return 'security-reviewer';
  if (activeGate === 'delivery_readiness' || activeGate === 'customer_review') return 'ceo';
  if (phaseId === 'discovery') return 'pm';
  if (phaseId === 'design') return 'cto';
  if (phaseId === 'plan') return 'lead-dev';
  if (phaseId === 'develop' || phaseId === 'fix') return 'lead-dev';
  if (phaseId === 'qa') return 'qa';
  if (phaseId === 'security') return 'security-reviewer';
  if (phaseId === 'delivery') return 'ceo';
  return '';
}

export function deriveCompanyGateFields({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
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

  // Table-driven lookup for standard phases
  const mapped = PHASE_GATE_MAP[observedPhase];
  if (mapped) {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: mapped.gate,
      active_gate_owner: mapped.owner,
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

export function deriveSessionGoal({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const activeGate = requireString(runtime?.active_gate);
  const readiness = normalizeDeliveryReadiness(runtime?.delivery_readiness);
  const phaseId = state ? resolvePhase(state).id : '';

  if (customerBlockers.length > 0 && !['develop', 'qa', 'security', 'fix'].includes(phaseId)) {
    return `Resolve customer blocker: ${customerBlockers[0].summary}`;
  }
  if (activeGate === 'design_readiness') return 'Close design readiness gate';
  if (activeGate === 'plan_readiness') return 'Lock the execution plan and task breakdown';
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
  if (phaseId === 'plan') return 'Turn the approved design into execution lanes and micro-tasks';
  if (phaseId === 'develop') return 'Advance the next implementation lane';
  if (phaseId === 'fix') return 'Resolve blockers and re-run verification';
  if (phaseId === 'delivery') return 'Prepare final delivery review';
  return '';
}

export function deriveSessionExitCriteria({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const activeGate = requireString(runtime?.active_gate);
  const phaseId = state ? resolvePhase(state).id : '';

  if (activeGate === 'design_readiness') return ['architecture approved internally', 'design specs complete', 'technical claims verified'];
  if (activeGate === 'plan_readiness') return ['execution plan written', 'lanes sequenced', 'task briefs linked'];
  if (activeGate === 'implementation_readiness') return ['lanes defined', 'owners assigned', 'session implementation brief written'];
  if (activeGate === 'qa') return ['QA blockers cleared', 'verification rerun complete'];
  if (activeGate === 'security') return ['security blockers cleared', 'delivery gate re-evaluated'];
  if (activeGate === 'delivery_readiness') return ['blocker count is zero', 'delivery report ready'];
  if (phaseId === 'discovery') return ['critical customer questions resolved', 'spec ready for internal review'];
  if (phaseId === 'plan') return ['task breakdown approved', 'execution order validated', 'handoff ready for developers'];
  if (phaseId === 'develop') return ['current reviewable slice completed', 'next session handoff recorded'];
  return [];
}

export function deriveSessionFields({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
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
