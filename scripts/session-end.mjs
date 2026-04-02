#!/usr/bin/env node
// Forge Hook: SessionEnd — snapshots a final runtime event for resume visibility

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  appendRecent,
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
    const endedAt = new Date().toISOString();

    updateRuntimeState(cwd, current => ({
      ...current,
      recent_agents: appendRecent(current.recent_agents, {
        kind: 'session-end',
        phase: state ? resolvePhase(state).id : 'none',
        at: endedAt,
      }),
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
