#!/usr/bin/env node
// Forge Hook: SessionStart — restores .forge/ state and injects compact adaptive context
//
// Host compatibility: Handles the SessionStart event.  On hosts that do not
// fire SessionStart (or send no stdin payload), readStdin() rejects and the
// catch block returns { continue: true } — state is not restored for that
// session but nothing is written or corrupted.
//
// The hookSpecificOutput response field (used to inject additionalContext) is a
// Claude Code convention.  On other hosts this field is silently ignored if the
// host does not understand it.

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
  let input;
  try {
    input = await readStdin();
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const normalized = writeForgeState(cwd, state);
    const nextRuntime = updateRuntimeState(cwd, current => ({
      ...current,
      active_tier: normalized.tier,
      stats: {
        ...current.stats,
        started_at: current.stats.started_at || normalized.created_at || new Date().toISOString(),
        session_count: (current.stats.session_count || 0) + 1,
      },
    }));

    const context = compactForgeContext(normalized, nextRuntime);
    updateRuntimeState(cwd, current => ({
      ...current,
      last_compact_context: context,
    }));

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    }));
  } catch (error) {
    handleHookError(error, 'state-restore', cwd);
  }
}

main();
