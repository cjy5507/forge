#!/usr/bin/env node
// Forge Hook: Stop — only blocks termination in full tier
//
// Host compatibility: This script handles the Claude Code Stop event.  On
// hosts that do not fire Stop, readStdin() rejects and the catch block returns
// { continue: true } — execution is never blocked.
//
// Claude Code-specific input fields (all accessed with ?. / fallbacks):
//   input.last_assistant_message — used to detect interactive prompts so the
//                                  guard does not block when the agent is
//                                  waiting for user input
//   input.stop_hook_active       — set by the host to prevent recursive blocks

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  appendRecent,
  isProjectActive,
  messageLooksInteractive,
  readActiveTier,
  readForgeState,
  resolvePhase,
  summarizePendingWork,
  tierAtLeast,
  updateRuntimeState,
} from './lib/forge-state.mjs';

async function main() {
  const envTier = process.env.FORGE_TIER;
  if (envTier === 'off' || envTier === 'light' || envTier === 'medium') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  let input;
  try {
    input = await readStdin();
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state || !isProjectActive(state)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const tier = readActiveTier(cwd, state, input);
    if (!tierAtLeast(tier, 'full')) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

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

    if (interactive || input?.stop_hook_active === true) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const pending = summarizePendingWork(state);
    const reason = `[Forge Stop Guard] Project "${state.project || 'unnamed'}" is still active in phase ${phase.id}. Pending: ${pending.join(', ')}.`;

    updateRuntimeState(cwd, current => ({
      ...current,
      stop_guard: {
        block_count: (runtime.stop_guard?.block_count || 0) + 1,
        last_reason: reason,
        last_message: lastMessage,
      },
      stats: {
        ...current.stats,
        stop_block_count: (current.stats.stop_block_count || 0) + 1,
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
    handleHookError(error, 'stop-guard', cwd);
  }
}

main();
