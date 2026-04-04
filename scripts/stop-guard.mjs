#!/usr/bin/env node
// Forge Hook: Stop — blocks termination during critical phases (develop/fix/qa)
// at any tier; blocks all phases at full tier only
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

const CRITICAL_PHASES = new Set(['develop', 'fix', 'qa']);

async function main() {
  const envTier = process.env.FORGE_TIER;
  if (envTier === 'off') {
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
    const phase = resolvePhase(state);
    const isCritical = CRITICAL_PHASES.has(phase.id);

    // For non-critical phases, only full tier gets stop protection
    if (!isCritical && !tierAtLeast(tier, 'full')) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

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

    // Critical phases at light/medium tier get a softer warning instead of a hard block
    if (isCritical && !tierAtLeast(tier, 'full')) {
      const warning = `[Forge Stop Guard] Warning: stopping during critical phase "${phase.id}" may leave work incomplete. Pending: ${pending.join(', ')}.`;
      updateRuntimeState(cwd, current => ({
        ...current,
        stop_guard: {
          block_count: (current.stop_guard?.block_count || 0) + 1,
          last_reason: warning,
          last_message: lastMessage,
        },
        stats: {
          ...(current.stats || {}),
          stop_block_count: ((current.stats || {}).stop_block_count || 0) + 1,
        },
        last_event: {
          name: 'StopWarned',
          at: new Date().toISOString(),
        },
      }));
      console.log(JSON.stringify({
        continue: true,
        suppressOutput: true,
        decision: 'warn',
        reason: warning,
      }));
      return;
    }

    const PHASE_TO_SKILL = { delivery: 'deliver', complete: 'info' };
    const currentSkill = PHASE_TO_SKILL[phase.id] || phase.id;
    const reason = `[Forge Stop Guard] Project "${state.project || 'unnamed'}" is still active in phase ${phase.id}. Pending: ${pending.join(', ')}.

[MAGIC KEYWORD: FORGE:${currentSkill.toUpperCase()}]

You MUST continue working. Invoke the skill using the Skill tool:
Skill: forge:${currentSkill}

The Forge pipeline is not complete. Do not stop — resume the current phase immediately.`;

    updateRuntimeState(cwd, current => ({
      ...current,
      stop_guard: {
        block_count: (current.stop_guard?.block_count || 0) + 1,
        last_reason: reason,
        last_message: lastMessage,
      },
      stats: {
        ...(current.stats || {}),
        stop_block_count: ((current.stats || {}).stop_block_count || 0) + 1,
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
