import {
  computeIntegrityFingerprint,
  DEFAULT_RUNTIME,
  getRuntimePath,
  getStatePath,
  readJsonFileDetailed,
  stripIntegrityMetadata,
} from './forge-io.mjs';
import { getPhaseSequence, resolvePhase } from './forge-phases.mjs';
import { normalizeRuntimeLanes } from './forge-lanes.mjs';

export const STATE_PARSE_WARNING = 'Unable to parse .forge/state.json; Forge is using a degraded fallback view.';
export const RUNTIME_PARSE_WARNING = 'Unable to parse .forge/runtime.json; Forge is using a degraded runtime fallback.';
export const STATE_INTEGRITY_WARNING = 'Integrity fingerprint mismatch in .forge/state.json; the file was likely edited outside Forge.';
export const RUNTIME_INTEGRITY_WARNING = 'Integrity fingerprint mismatch in .forge/runtime.json; the file was likely edited outside Forge.';
const STATE_PATH = '.forge/state.json';
const RUNTIME_PATH = '.forge/runtime.json';
const COMPLETION_GUARD_SOURCE = 'completion_guard';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectShapeIssues(value, requiredFields) {
  if (!isRecord(value)) {
    return ['root'];
  }

  const issues = [];
  for (const [field, type] of Object.entries(requiredFields)) {
    const entry = value[field];
    const valid = type === 'array'
      ? Array.isArray(entry)
      : type === 'object'
        ? isRecord(entry)
        : typeof entry === type;

    if (!valid) {
      issues.push(field);
    }
  }

  return issues;
}

function buildShapeWarning(path, issues) {
  return `Critical fields are invalid in ${path}: ${issues.join(', ')}`;
}

function getIntegrityWarning(path, value) {
  if (!isRecord(value) || !isRecord(value._integrity)) {
    return '';
  }

  const fingerprint = typeof value._integrity.fingerprint === 'string' ? value._integrity.fingerprint.trim() : '';
  if (!fingerprint) {
    return '';
  }

  const computed = computeIntegrityFingerprint(stripIntegrityMetadata(value));
  if (computed === fingerprint) {
    return '';
  }

  return path === STATE_PATH ? STATE_INTEGRITY_WARNING : RUNTIME_INTEGRITY_WARNING;
}

function getRuntimeCompletionBlockers(runtime = {}) {
  const blockers = [];
  const lanes = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}));
  const openLanes = lanes.filter(lane => !['done', 'merged'].includes(String(lane?.status || '').toLowerCase()));
  const verificationStatus = String(runtime?.verification?.status || '').toLowerCase();
  const recoveryStatus = String(runtime?.recovery?.latest?.status || '').toLowerCase();

  if (openLanes.length > 0) {
    blockers.push(`${openLanes.length} unfinished lane${openLanes.length === 1 ? '' : 's'}`);
  }
  if (verificationStatus === 'failed') {
    blockers.push('verification failed');
  }
  if (['active', 'escalated'].includes(recoveryStatus)) {
    blockers.push(`recovery ${recoveryStatus}`);
  }

  return blockers;
}

function claimsTerminalDelivery(state = {}, runtime = {}) {
  const phase = resolvePhase(state);
  return phase.id === 'complete'
    || String(state?.status || '').toLowerCase() === 'delivered'
    || String(runtime?.delivery_readiness || '').toLowerCase() === 'delivered';
}

function clearCompletionGuardBlockers(blockers = []) {
  return Array.isArray(blockers)
    ? blockers.filter(blocker => !(blocker && typeof blocker === 'object' && blocker.source === COMPLETION_GUARD_SOURCE))
    : [];
}

export function getStateShapeWarnings(value) {
  const issues = collectShapeIssues(value, {
    phase: 'string',
    phase_id: 'string',
    phase_name: 'string',
    mode: 'string',
    status: 'string',
    agents_active: 'array',
    tasks: 'array',
    holes: 'array',
    pr_queue: 'array',
  });

  return issues.length > 0 ? [buildShapeWarning(STATE_PATH, issues)] : [];
}

export function getRuntimeShapeWarnings(value) {
  const issues = collectShapeIssues(value, {
    version: 'number',
    delivery_readiness: 'string',
    lanes: 'object',
    active_agents: 'object',
    recent_agents: 'array',
    recent_failures: 'array',
    analysis: 'object',
    next_action: 'object',
    host_context: 'object',
    stats: 'object',
  });

  return issues.length > 0 ? [buildShapeWarning(RUNTIME_PATH, issues)] : [];
}

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
  if (stateResult.exists && !stateResult.error) {
    warnings.push(...getStateShapeWarnings(stateResult.value));
    const integrityWarning = getIntegrityWarning(STATE_PATH, stateResult.value);
    if (integrityWarning) {
      warnings.push(integrityWarning);
    }
  }
  if (runtimeResult.exists && !runtimeResult.error) {
    warnings.push(...getRuntimeShapeWarnings(runtimeResult.value));
    const integrityWarning = getIntegrityWarning(RUNTIME_PATH, runtimeResult.value);
    if (integrityWarning) {
      warnings.push(integrityWarning);
    }
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

  const completionBlockers = getRuntimeCompletionBlockers(runtime);
  if (claimsTerminalDelivery(state, runtime) && completionBlockers.length > 0) {
    const summary = `Completion blocked: ${completionBlockers.join(', ')}`;
    corrections.push(summary);
    runtimeFixes.delivery_readiness = 'blocked';
    runtimeFixes.internal_blockers = [
      ...clearCompletionGuardBlockers(runtime.internal_blockers),
      {
        source: COMPLETION_GUARD_SOURCE,
        summary,
        owner: 'lead-dev',
        severity: 'blocker',
        phase: phase.id,
      },
    ];
  }

  return {
    valid: corrections.length === 0,
    corrections,
    runtimeFixes,
  };
}
