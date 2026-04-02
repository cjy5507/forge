#!/usr/bin/env node
// Forge Hook: SubagentStart — tracks medium/full tier subagents and injects compact context

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  appendRecent,
  readActiveTier,
  readForgeState,
  readRuntimeState,
  recommendedAgentsFor,
  resolvePhase,
  tierAtLeast,
  updateRuntimeState,
} from './lib/forge-state.mjs';

async function main() {
  const envTier = process.env.FORGE_TIER;
  if (envTier === 'off' || envTier === 'light') {
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
  const tier = readActiveTier(cwd, state, input);

  try {
    if (!tierAtLeast(tier, 'medium')) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const startedAt = new Date().toISOString();
    const phaseId = state ? resolvePhase(state).id : 'develop';
    const runtime = readRuntimeState(cwd);
    const taskType = runtime.last_task_type || 'feature';
    const recommended = recommendedAgentsFor({ tier, taskType, phaseId });

    updateRuntimeState(cwd, current => ({
      ...current,
      active_tier: tier,
      recommended_agents: current.recommended_agents?.length ? current.recommended_agents : recommended,
      active_agents: {
        ...current.active_agents,
        [input?.agent_id || `unknown-${Date.now()}`]: {
          id: input?.agent_id || 'unknown',
          type: input?.agent_type || 'unknown',
          status: 'running',
          started_at: startedAt,
          transcript_path: input?.transcript_path || '',
        },
      },
      recent_agents: appendRecent(current.recent_agents, {
        kind: 'subagent-start',
        id: input?.agent_id || 'unknown',
        type: input?.agent_type || 'unknown',
        at: startedAt,
      }),
      stats: {
        ...current.stats,
        agent_calls: (current.stats.agent_calls || 0) + 1,
      },
      last_event: {
        name: 'SubagentStart',
        at: startedAt,
      },
    }));

    if (!state) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: `[Forge] ${tier} ${phaseId} [${recommended.join(', ')}]`,
      },
    }));
  } catch (error) {
    handleHookError(error, 'subagent-start', cwd);
  }
}

main();
