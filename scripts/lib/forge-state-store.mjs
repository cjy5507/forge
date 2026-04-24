import {
  DEFAULT_RUNTIME,
  ensureForgeProjectLayout,
  getRuntimePath,
  getStatePath,
  mergeStats,
  readJsonFile,
  readJsonFileDetailed,
  stampIntegrity,
  writeJsonFile,
  withForgeLock,
} from './forge-io.mjs';
import { applyHostContext } from './forge-host.mjs';
import { checkPhaseGate, resolvePhase, validatePhaseTransition } from './forge-phases.mjs';
import { tierAtLeast } from './forge-tiers.mjs';
import {
  RUNTIME_PARSE_WARNING,
  STATE_PARSE_WARNING,
  getRuntimeShapeWarnings,
  getStateShapeWarnings,
  validateStateConsistency,
} from './forge-state-trust.mjs';
import { initializeLessonsBrief } from './forge-lessons-loader.mjs';

const PHASE_GATE_BLOCKER_SOURCE = 'phase_gate';

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

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
    const trustWarnings = uniqueStrings([
      ...(stateResult.error ? [STATE_PARSE_WARNING] : []),
      ...(stateResult.error ? [] : getStateShapeWarnings(raw)),
    ]);
    delete normalized._trust_warnings;
    if (trustWarnings.length > 0) {
      normalized._trust_warnings = trustWarnings;
    }
    return normalized;
  }

  function writeRuntimeState(cwd = '.', runtime, { state = undefined } = {}) {
    return withForgeLock(cwd, () => {
      ensureForgeProjectLayout(cwd);
      const next = {
        ...normalizeRuntimeState(runtime, { state: state !== undefined ? state : readForgeState(cwd) }),
        updated_at: new Date().toISOString(),
      };
      delete next._trust_warnings;

      const stamped = stampIntegrity(next, 'runtime');
      writeJsonFile(getRuntimePath(cwd), stamped);
      return stamped;
    });
  }

  function applyPhaseTransitionGuard(normalized, previousState, { allowRollback }) {
    if (!previousState) {
      return { normalized, previousPhase: null };
    }

    const previousPhase = resolvePhase(previousState);
    const nextPhase = resolvePhase(normalized);
    const transition = validatePhaseTransition(previousPhase.id, nextPhase.id, nextPhase.mode, { allowRollback });

    if (!transition.valid) {
      process.stderr.write(`[Forge] warning: ${transition.reason}\n`);
      normalized.phase = previousPhase.id;
      normalized.phase_id = previousPhase.id;
      normalized.phase_index = previousPhase.index;
      normalized.phase_name = previousPhase.label;
    }

    return { normalized, previousPhase };
  }

  function applyPhaseGateCheck(normalized, existingRuntime, previousPhase, cwd) {
    const phase = resolvePhase(normalized);
    const retainedInternalBlockers = clearPhaseGateBlockers(existingRuntime.internal_blockers);
    existingRuntime.internal_blockers = retainedInternalBlockers;

    const gateResult = checkPhaseGate(cwd, phase.id, phase.mode, { tier: normalized.tier });
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

    return { normalized, existingRuntime };
  }

  function writeForgeState(cwd = '.', state, { allowRollback = false } = {}) {
    return withForgeLock(cwd, () => {
      ensureForgeProjectLayout(cwd);
      const normalized = normalizeStateShape(state);
      delete normalized._trust_warnings;
      normalized.updated_at = new Date().toISOString();

      const previousState = readJsonFile(getStatePath(cwd));
      if (!previousState && !Array.isArray(normalized.lessons_brief)) {
        try {
          normalized.lessons_brief = initializeLessonsBrief(cwd, {
            projectType: normalized.project || '',
          });
        } catch (error) {
          process.stderr.write(`[Forge] warning: lessons_brief init failed: ${error.message}\n`);
          normalized.lessons_brief = [];
        }
      }
      const { normalized: withTransition, previousPhase } = applyPhaseTransitionGuard(normalized, previousState, { allowRollback });

      const existingRuntime = readJsonFile(getRuntimePath(cwd), DEFAULT_RUNTIME);
      const { normalized: withGate, existingRuntime: updatedRuntime } = applyPhaseGateCheck(withTransition, existingRuntime, previousPhase, cwd);

      const consistency = validateStateConsistency(withGate, updatedRuntime);
      if (consistency.corrections.length > 0) {
        for (const correction of consistency.corrections) {
          process.stderr.write(`[Forge] auto-correct: ${correction}\n`);
        }
        Object.assign(updatedRuntime, consistency.runtimeFixes);
      }

      const stampedState = stampIntegrity(withGate, 'state');
      writeJsonFile(getStatePath(cwd), stampedState);
      // Pass state explicitly to avoid redundant readForgeState inside writeRuntimeState
      writeRuntimeState(cwd, updatedRuntime, { state: stampedState });
      return stampedState;
    });
  }

  function readRuntimeState(cwd = '.', { state = undefined } = {}) {
    const runtimeResult = readJsonFileDetailed(getRuntimePath(cwd), DEFAULT_RUNTIME);
    const normalized = normalizeRuntimeState(
      runtimeResult.value,
      { state: state !== undefined ? state : readForgeState(cwd) },
    );
    const trustWarnings = uniqueStrings([
      ...(runtimeResult.error ? [RUNTIME_PARSE_WARNING] : []),
      ...(runtimeResult.error ? [] : getRuntimeShapeWarnings(runtimeResult.value)),
    ]);
    delete normalized._trust_warnings;
    if (trustWarnings.length > 0) {
      normalized._trust_warnings = trustWarnings;
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
