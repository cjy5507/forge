#!/usr/bin/env node
// Forge Hook: SubagentStart — tracks medium/full tier subagents and injects compact context
//
// Host compatibility: This script handles the Claude Code SubagentStart event.
// On hosts that do not fire SubagentStart, readStdin() will reject (empty or no
// stdin) and the catch block returns { continue: true } silently — no action is
// taken and the host continues normally.
//
// Claude Code-specific input fields used below (all accessed with ?. / fallbacks
// so missing fields are safe on other hosts):
//   input.agent_id       — unique ID of the spawned sub-agent
//   input.agent_type     — e.g. "forge:developer", "forge:qa"
//   input.transcript_path — path to the sub-agent's conversation transcript

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  appendRecent,
  readActiveTier,
  readForgeState,
  resolveForgeBaseDir,
  resolveRuntimeLaneContext,
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
  const rootCwd = resolveForgeBaseDir(cwd);
  const state = readForgeState(rootCwd);
  const tier = readActiveTier(rootCwd, state, input);

  try {
    if (!tierAtLeast(tier, 'medium')) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const startedAt = new Date().toISOString();
    const phaseId = state ? resolvePhase(state).id : 'develop';
    const runtime = readRuntimeState(rootCwd);
    const { laneId, lane } = resolveRuntimeLaneContext(runtime, rootCwd, cwd);
    const taskType = runtime.last_task_type || 'feature';
    const recommended = recommendedAgentsFor({ tier, taskType, phaseId });
    const agentId = input?.agent_id || `unknown-${Date.now()}`;
    const agentType = input?.agent_type || 'unknown';

    updateRuntimeState(rootCwd, current => {
      const nextLanes = laneId
        ? {
            ...current.lanes,
            [laneId]: {
              ...lane,
              owner_agent_id: agentId,
              owner_agent_type: agentType,
              status: 'in_progress',
              last_event_at: startedAt,
            },
          }
        : current.lanes;

      const nextWorktrees = laneId
        ? {
            ...current.active_worktrees,
            [laneId]: lane?.worktree_path || cwd,
          }
        : current.active_worktrees;

      return {
        ...current,
        active_tier: tier,
        recommended_agents: current.recommended_agents?.length ? current.recommended_agents : recommended,
        lanes: nextLanes,
        active_worktrees: nextWorktrees,
        active_agents: {
          ...current.active_agents,
          [agentId]: {
            id: input?.agent_id || 'unknown',
            type: agentType,
            status: 'running',
            started_at: startedAt,
            transcript_path: input?.transcript_path || '',
            lane_id: laneId,
          },
        },
        recent_agents: appendRecent(current.recent_agents, {
          kind: 'subagent-start',
          id: input?.agent_id || 'unknown',
          type: agentType,
          at: startedAt,
          lane_id: laneId,
        }),
        stats: {
          ...current.stats,
          agent_calls: (current.stats.agent_calls || 0) + 1,
        },
        last_event: {
          name: 'SubagentStart',
          at: startedAt,
        },
      };
    });

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
    handleHookError(error, 'subagent-start', rootCwd);
  }
}

main();
