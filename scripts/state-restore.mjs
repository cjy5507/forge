#!/usr/bin/env node
// Forge Hook: SessionStart — restores .forge/ state and injects compact adaptive context

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  compactForgeContext,
  readForgeState,
  readRuntimeState,
  updateRuntimeState,
  writeForgeState,
} from './lib/forge-state.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const normalized = writeForgeState(cwd, state);
    updateRuntimeState(cwd, current => ({
      ...current,
      active_tier: normalized.tier,
      stats: {
        ...current.stats,
        started_at: current.stats.started_at || normalized.created_at || new Date().toISOString(),
        session_count: (current.stats.session_count || 0) + 1,
      },
    }));

    const context = compactForgeContext(normalized, readRuntimeState(cwd));

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    }));
  } catch (error) {
    handleHookError(error, 'state-restore');
  }
}

main();
