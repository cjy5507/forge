#!/usr/bin/env node
// Forge Hook: SessionEnd — snapshot runtime stats for later comparison

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  appendRecent,
  readActiveTier,
  readForgeState,
  resolvePhase,
  summarizePendingWork,
  updateRuntimeState,
} from './lib/forge-state.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';

  try {
    const state = readForgeState(cwd);
    const tier = readActiveTier(cwd, state, input);
    const endedAt = new Date().toISOString();

    updateRuntimeState(cwd, current => ({
      ...current,
      active_tier: tier,
      recent_agents: appendRecent(current.recent_agents, {
        kind: 'session-end',
        phase: state ? resolvePhase(state).id : 'none',
        at: endedAt,
      }),
      stats: {
        ...current.stats,
        last_finished_at: endedAt,
      },
      last_event: {
        name: 'SessionEnd',
        at: endedAt,
        pending: state ? summarizePendingWork(state) : [],
      },
    }));

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch (error) {
    handleHookError(error, 'session-end');
  }
}

main();
