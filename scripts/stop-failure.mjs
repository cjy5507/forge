#!/usr/bin/env node
// Forge Hook: StopFailure — logs turn-ending API failures for later recovery
//
// Host compatibility: This script handles the Claude Code StopFailure event,
// which fires when the host's final-turn API call fails.  On hosts that do not
// fire StopFailure, readStdin() rejects and the catch block returns
// { continue: true } — no failure is logged and the host continues normally.
//
// Claude Code-specific input fields (all accessed with ?. / fallbacks):
//   input.error          — human-readable error string from the host
//   input.error_details  — structured details (may be absent on other hosts)
//   input.last_assistant_message — partial message before the failure

import { runHook } from './lib/hook-runner.mjs';
import { logHookError } from './lib/error-handler.mjs';
import { appendRecent, updateRuntimeState } from './lib/forge-state.mjs';

runHook(async (input) => {
  const cwd = input?.cwd || '.';

  const entry = {
    at: new Date().toISOString(),
    kind: 'stop-failure',
    error: input?.error || 'unknown',
    details: input?.error_details || '',
    message: input?.last_assistant_message || '',
  };

  updateRuntimeState(cwd, current => ({
    ...current,
    recent_failures: appendRecent(current.recent_failures, entry),
    last_event: {
      name: 'StopFailure',
      at: entry.at,
    },
  }));

  logHookError(
    new Error(`StopFailure: ${entry.error}`),
    'stop-failure',
    cwd,
  );

  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}, { name: 'stop-failure' });
