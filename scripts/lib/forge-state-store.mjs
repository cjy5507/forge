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
import {
  RUNTIME_PARSE_WARNING,
  STATE_PARSE_WARNING,
  validateStateConsistency,
} from './forge-state-trust.mjs';

export function createStateStore({ normalizeStateShape, normalizeRuntimeState }) {
  function readForgeState(cwd = '.') {
    const stateResult = readJsonFileDetailed(getStatePath(cwd), null);
    const raw = stateResult.value;
    if (!raw) {
      return null;
    }

    const normalized = normalizeStateShape(raw);
    if (stateResult.error) {
      normalized._trust_warnings = [
        ...(normalized._trust_warnings || []),
        STATE_PARSE_WARNING,
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
      if (previousState) {
        const prevPhase = resolvePhase(previousState);
        const nextPhase = resolvePhase(normalized);
        const transition = validatePhaseTransition(prevPhase.id, nextPhase.id, nextPhase.mode, { allowRollback });
        if (!transition.valid) {
          normalized._phase_transition_warning = transition.reason;
          process.stderr.write(`[Forge] warning: ${transition.reason}\n`);
          normalized.phase = prevPhase.id;
          normalized.phase_id = prevPhase.id;
          normalized.phase_index = prevPhase.index;
          normalized.phase_name = prevPhase.label;
        }
      }

      const phase = resolvePhase(normalized);
      const gateResult = checkPhaseGate(cwd, phase.id, phase.mode);
      if (!gateResult.canAdvance) {
        normalized._phase_gate_warning = `Phase ${phase.id} requires missing artifacts: ${gateResult.missing.join(', ')}`;
      }
      if (phase.mismatch) {
        normalized._phase_mismatch_warning = `Phase "${phase.id}" does not belong to ${phase.mode} sequence — using fallback`;
      }

      const existingRuntime = readJsonFile(getRuntimePath(cwd), DEFAULT_RUNTIME);
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
    if (runtimeResult.error) {
      normalized._trust_warnings = [
        ...(normalized._trust_warnings || []),
        RUNTIME_PARSE_WARNING,
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
