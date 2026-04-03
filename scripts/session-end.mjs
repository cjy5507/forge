#!/usr/bin/env node
// Forge Hook: SessionEnd — snapshot runtime stats for later comparison
//
// Host compatibility: Handles the SessionEnd event (supported on Claude Code;
// may vary on other hosts).  On hosts that do not fire SessionEnd, readStdin()
// rejects and the catch block returns { continue: true } — stats are simply not
// snapshotted for that session.  No data is corrupted by the omission.

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { cleanupSessionArtifacts } from './lib/session-cleanup.mjs';
import {
  appendRecent,
  readActiveTier,
  readForgeState,
  resolvePhase,
  summarizePendingWork,
  updateRuntimeState,
} from './lib/forge-state.mjs';

async function main() {
  let input;
  try {
    input = await readStdin();
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  const cwd = input?.cwd || '.';

  try {
    const state = readForgeState(cwd);
    const tier = readActiveTier(cwd, state, input);
    const endedAt = new Date().toISOString();

    updateRuntimeState(cwd, current => ({
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
    }));

    cleanupSessionArtifacts(cwd);

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch (error) {
    handleHookError(error, 'session-end', cwd);
  }
}

main();
