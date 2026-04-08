import {
  DEFAULT_RUNTIME,
  ensureForgeDir,
  getRuntimePath,
  getStatePath,
  mergeStats,
  readJsonFile,
  readJsonFileDetailed,
  writeJsonFile,
  withForgeLock,
} from './forge-io.mjs';
import { applyHostContext } from './forge-host-context.mjs';
import { checkPhaseGate, resolvePhase, validatePhaseTransition } from './forge-phases.mjs';
import { tierAtLeast } from './forge-tiers.mjs';
import {
  RUNTIME_PARSE_WARNING,
  STATE_PARSE_WARNING,
  getRuntimeShapeWarnings,
  getStateShapeWarnings,
  validateStateConsistency,
} from './forge-state-trust.mjs';

const PHASE_GATE_BLOCKER_SOURCE = 'phase_gate';

function buildPhaseGateWarning(phase, gateResult) {
  return `Phase ${phase.id} requires missing artifacts: ${gateResult.missing.join(', ')}`;
}

function clearPhaseGateBlockers(blockers = []) {
  if (!Array.isArray(blockers)) {
    return [];
  }

  return blockers.filter(blocker => !(blocker && typeof blocker === 'object' && blocker.source === PHASE_GATE_BLOCKER_SOURCE));
}

function buildPhaseGateBlocker(summary, phase) {
  return {
    source: PHASE_GATE_BLOCKER_SOURCE,
    summary,
    owner: 'lead-dev',
    severity: 'blocker',
    phase: phase.id,
  };
}

export function createStateStore({ normalizeStateShape, normalizeRuntimeState }) {
  function readForgeState(cwd = '.') {
    const stateResult = readJsonFileDetailed(getStatePath(cwd), null);
    const raw = stateResult.value;
    if (!raw) {
      return null;
    }

    const normalized = normalizeStateShape(raw);
    const trustWarnings = [
      ...(stateResult.error ? [STATE_PARSE_WARNING] : []),
      ...(stateResult.error ? [] : getStateShapeWarnings(raw)),
    ];
    if (trustWarnings.length > 0) {
      normalized._trust_warnings = [
        ...(normalized._trust_warnings || []),
        ...trustWarnings,
      ];
    }
    return normalized;
  }

  function writeRuntimeState(cwd = '.', runtime, { state = undefined } = {}) {
    return withForgeLock(cwd, () => {
      ensureForgeDir(cwd);
      const next = {
        ...normalizeRuntimeState(runtime, { state: state !== undefined ? state : readForgeState(cwd) }),
        updated_at: new Date().toISOString(),
      };

      writeJsonFile(getRuntimePath(cwd), next);
      return next;
    });
  }

  function writeForgeState(cwd = '.', state, { allowRollback = false } = {}) {
    return withForgeLock(cwd, () => {
      ensureForgeDir(cwd);
      const normalized = normalizeStateShape(state);
      normalized.updated_at = new Date().toISOString();

      const previousState = readJsonFile(getStatePath(cwd));
      let previousPhase = null;
      if (previousState) {
        previousPhase = resolvePhase(previousState);
        const nextPhase = resolvePhase(normalized);
        const transition = validatePhaseTransition(previousPhase.id, nextPhase.id, nextPhase.mode, { allowRollback });
        if (!transition.valid) {
          normalized._phase_transition_warning = transition.reason;
          process.stderr.write(`[Forge] warning: ${transition.reason}\n`);
          normalized.phase = previousPhase.id;
          normalized.phase_id = previousPhase.id;
          normalized.phase_index = previousPhase.index;
          normalized.phase_name = previousPhase.label;
        }
      }

      const phase = resolvePhase(normalized);
      const existingRuntime = readJsonFile(getRuntimePath(cwd), DEFAULT_RUNTIME);
      const retainedInternalBlockers = clearPhaseGateBlockers(existingRuntime.internal_blockers);
      existingRuntime.internal_blockers = retainedInternalBlockers;

      const gateResult = checkPhaseGate(cwd, phase.id, phase.mode);
      if (!gateResult.canAdvance) {
        const gateWarning = buildPhaseGateWarning(phase, gateResult);
        normalized._phase_gate_warning = gateWarning;

        if (tierAtLeast(normalized.tier, 'full')) {
          existingRuntime.internal_blockers = [
            ...retainedInternalBlockers,
            buildPhaseGateBlocker(gateWarning, phase),
          ];
          existingRuntime.delivery_readiness = 'blocked';

          if (previousPhase && previousPhase.id !== phase.id) {
            normalized._phase_gate_blocked = `Blocked phase advance to ${phase.id} at tier ${normalized.tier}`;
            normalized.phase = previousPhase.id;
            normalized.phase_id = previousPhase.id;
            normalized.phase_index = previousPhase.index;
            normalized.phase_name = previousPhase.label;
          }
        }
      } else if (existingRuntime.delivery_readiness === 'blocked' && retainedInternalBlockers.length === 0) {
        existingRuntime.delivery_readiness = 'in_progress';
      }

      if (phase.mismatch) {
        normalized._phase_mismatch_warning = `Phase "${phase.id}" does not belong to ${phase.mode} sequence — using fallback`;
      }

      const consistency = validateStateConsistency(normalized, existingRuntime);
      if (consistency.corrections.length > 0) {
        for (const correction of consistency.corrections) {
          process.stderr.write(`[Forge] auto-correct: ${correction}\n`);
        }
        Object.assign(existingRuntime, consistency.runtimeFixes);
      }

      writeJsonFile(getStatePath(cwd), normalized);
      writeRuntimeState(cwd, existingRuntime);
      return normalized;
    });
  }

  function readRuntimeState(cwd = '.', { state = undefined } = {}) {
    const runtimeResult = readJsonFileDetailed(getRuntimePath(cwd), DEFAULT_RUNTIME);
    const normalized = normalizeRuntimeState(
      runtimeResult.value,
      { state: state !== undefined ? state : readForgeState(cwd) },
    );
    const trustWarnings = [
      ...(runtimeResult.error ? [RUNTIME_PARSE_WARNING] : []),
      ...(runtimeResult.error ? [] : getRuntimeShapeWarnings(runtimeResult.value)),
    ];
    if (trustWarnings.length > 0) {
      normalized._trust_warnings = [
        ...(normalized._trust_warnings || []),
        ...trustWarnings,
      ];
    }
    return normalized;
  }

  function updateRuntimeState(cwd = '.', updater) {
    return withForgeLock(cwd, () => {
      const state = readForgeState(cwd);
      const runtimePath = getRuntimePath(cwd);
      const current = normalizeRuntimeState(
        readJsonFile(runtimePath, DEFAULT_RUNTIME),
        { state },
      );
      const next = updater(current);
      return writeRuntimeState(cwd, next, { state });
    });
  }

  function updateRuntimeHookContext(cwd = '.', {
    hostId = '',
    eventName = '',
    resumed = false,
    updater = null,
    contextBuilder = null,
  } = {}) {
    return updateRuntimeState(cwd, current => {
      const updated = typeof updater === 'function' ? updater(current) : current;
      const withHost = applyHostContext(updated, {
        hostId,
        eventName,
        resumed,
      });
      const nextContext = typeof contextBuilder === 'function' ? contextBuilder(withHost) : '';

      return nextContext
        ? {
            ...withHost,
            last_compact_context: nextContext,
          }
        : withHost;
    });
  }

  function recordStateStats(cwd = '.', updater) {
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

  return {
    readForgeState,
    writeForgeState,
    readRuntimeState,
    writeRuntimeState,
    updateRuntimeState,
    updateRuntimeHookContext,
    recordStateStats,
  };
}
