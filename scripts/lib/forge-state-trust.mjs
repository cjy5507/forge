import {
  DEFAULT_RUNTIME,
  getRuntimePath,
  getStatePath,
  readJsonFileDetailed,
} from './forge-io.mjs';
import { getPhaseSequence, resolvePhase } from './forge-phases.mjs';

export const STATE_PARSE_WARNING = 'Unable to parse .forge/state.json; Forge is using a degraded fallback view.';
export const RUNTIME_PARSE_WARNING = 'Unable to parse .forge/runtime.json; Forge is using a degraded runtime fallback.';

export function getStateTrustWarnings(cwd = '.') {
  const warnings = [];
  const stateResult = readJsonFileDetailed(getStatePath(cwd), null, { logErrors: false });
  const runtimeResult = readJsonFileDetailed(getRuntimePath(cwd), DEFAULT_RUNTIME, { logErrors: false });

  if (stateResult.exists && stateResult.error) {
    warnings.push(STATE_PARSE_WARNING);
  }
  if (runtimeResult.exists && runtimeResult.error) {
    warnings.push(RUNTIME_PARSE_WARNING);
  }

  return warnings;
}

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

  // Express uses 'ship' instead of 'delivery'; check both.
  const latePhaseIndex = deliveryIndex !== -1 ? deliveryIndex : sequence.indexOf('ship');
  if (delivery === 'delivered' && latePhaseIndex !== -1 && phaseIndex < latePhaseIndex) {
    corrections.push(`phase=${phase.id} but delivery_readiness=delivered — resetting to in_progress`);
    runtimeFixes.delivery_readiness = 'in_progress';
  }

  if (phase.id === 'complete' && state.status === 'active') {
    corrections.push('phase=complete but status=active — should be completed');
  }

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
