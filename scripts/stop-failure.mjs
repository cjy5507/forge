#!/usr/bin/env node
// Forge Hook: StopFailure — logs turn-ending API failures for later recovery

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { appendRecent, updateRuntimeState } from './lib/forge-state.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';

  try {
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

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch (error) {
    handleHookError(error, 'stop-failure');
  }
}

main();
