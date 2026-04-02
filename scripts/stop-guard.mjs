#!/usr/bin/env node
// Forge Hook: Stop — blocks premature main-agent termination while a Forge project is still active

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  appendRecent,
  isProjectActive,
  messageLooksInteractive,
  readForgeState,
  resolvePhase,
  summarizePendingWork,
  updateRuntimeState,
} from './lib/forge-state.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state || !isProjectActive(state)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const phase = resolvePhase(state);
    const lastMessage = String(input?.last_assistant_message || '');
    const interactive = messageLooksInteractive(lastMessage);

    const runtime = updateRuntimeState(cwd, current => ({
      ...current,
      recent_agents: appendRecent(current.recent_agents, {
        kind: 'main-stop-attempt',
        phase: phase.id,
        at: new Date().toISOString(),
      }),
      last_event: {
        name: 'Stop',
        at: new Date().toISOString(),
      },
    }));

    const alreadyBlocked = input?.stop_hook_active === true;
    if (interactive || alreadyBlocked) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const pending = summarizePendingWork(state);
    const reason = `[Forge Stop Guard] Project "${state.project || 'unnamed'}" is still active in phase ${phase.id}. Pending: ${pending.join(', ')}. Continue by advancing the phase, dispatching the next step, or explicitly asking the client for approval before stopping.`;

    updateRuntimeState(cwd, current => ({
      ...current,
      stop_guard: {
        block_count: (runtime.stop_guard?.block_count || 0) + 1,
        last_reason: reason,
        last_message: lastMessage,
      },
      last_event: {
        name: 'StopBlocked',
        at: new Date().toISOString(),
      },
    }));

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      decision: 'block',
      reason,
    }));
  } catch (error) {
    handleHookError(error, 'stop-guard');
  }
}

main();
