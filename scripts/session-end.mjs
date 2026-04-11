#!/usr/bin/env node
// Forge Hook: SessionEnd — snapshot runtime stats for later comparison
//
// Host compatibility: Handles the SessionEnd event (supported on Claude Code;
// may vary on other hosts).  On hosts that do not fire SessionEnd, readStdin()
// rejects and the catch block returns { continue: true } — stats are simply not
// snapshotted for that session.  No data is corrupted by the omission.

import { runHook } from './lib/hook-runner.mjs';
import { cleanupSessionArtifacts, cleanupForgeBranches, clearHudCustomLine, compactRuntimeState } from './lib/session-cleanup.mjs';
import { appendRecent } from './lib/forge-io.mjs';
import { readActiveTier } from './lib/forge-tiers.mjs';
import { readForgeState, readRuntimeState, summarizePendingWork, updateRuntimeState } from './lib/forge-session.mjs';
import { isProjectActive } from './lib/forge-interaction.mjs';
import { resolvePhase } from './lib/forge-phases.mjs';
import { finalizeSessionCost } from './lib/forge-metrics.mjs';
import { logHookError } from './lib/error-handler.mjs';

runHook(async (input) => {
  const cwd = input?.cwd || '.';

  const state = readForgeState(cwd);
  const tier = readActiveTier(cwd, state, input);
  const endedAt = new Date().toISOString();

  updateRuntimeState(cwd, current => {
    const next = {
      ...current,
      active_tier: tier,
      active_agents: {},
      recent_agents: appendRecent(current.recent_agents, {
        kind: 'session-end',
        phase: state ? resolvePhase(state).id : 'none',
        at: endedAt,
      }),
      stats: {
        ...current.stats,
        last_finished_at: endedAt,
        session_duration_ms: current.stats.started_at
          ? Date.now() - new Date(current.stats.started_at).getTime()
          : 0,
      },
      last_event: {
        name: 'SessionEnd',
        at: endedAt,
        pending: state ? summarizePendingWork(state) : [],
      },
    };
    compactRuntimeState(next);
    return next;
  });

  // Gate cost finalization on project activity. Writing a session-*.json for
  // inactive sessions (no .forge/state.json, or phase=complete/delivered)
  // produces empty shells that pollute tier-comparison history. Mirrors the
  // isProjectActive gate in stop-guard.mjs which skips cost sampling for the
  // same reason.
  if (state && isProjectActive(state)) {
    try {
      finalizeSessionCost(cwd);
    } catch (error) {
      // Cost finalization must never break session cleanup, but we no longer
      // swallow errors silently — logHookError leaves a trail in errors.log
      // so failures surface on inspection (R2: no silent catch).
      logHookError(error, 'session-end:cost-finalize', cwd);
    }
  }

  cleanupSessionArtifacts(cwd);
  cleanupForgeBranches(cwd, readRuntimeState(cwd));
  clearHudCustomLine();

  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}, { name: 'session-end' });
