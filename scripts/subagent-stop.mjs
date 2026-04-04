#!/usr/bin/env node
// Forge Hook: SubagentStop — records completion in medium/full tier
//
// Host compatibility: This script handles the Claude Code SubagentStop event.
// On hosts that do not fire SubagentStop, readStdin() rejects and the catch
// block returns { continue: true } — the host continues normally without error.
//
// Claude Code-specific input fields (all accessed with ?. / fallbacks):
//   input.agent_id             — ID of the completed sub-agent
//   input.agent_type           — agent type string
//   input.last_assistant_message — final message produced by the sub-agent,
//                                  captured as a handoff note for next session

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  appendRecent,
  readActiveTier,
  readForgeState,
  resolveForgeBaseDir,
  resolveRuntimeLaneContext,
  tierAtLeast,
  updateHudLine,
  updateRuntimeState,
} from './lib/forge-state.mjs';

async function main() {
  const envTier = (process.env.FORGE_TIER || '').toLowerCase();
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

    const stoppedAt = new Date().toISOString();
    const agentId = input?.agent_id || 'unknown';

    const updatedRuntime = updateRuntimeState(rootCwd, current => {
      const activeAgent = current.active_agents?.[agentId] || null;
      const { laneId, lane } = resolveRuntimeLaneContext(current, rootCwd, cwd, activeAgent?.lane_id || '');
      const nextAgents = { ...current.active_agents };
      delete nextAgents[agentId];
      const noteText = String(input?.last_assistant_message || '').trim();
      const nextLanes = laneId
        ? {
            ...current.lanes,
            [laneId]: {
              ...lane,
              last_event_at: stoppedAt,
              session_handoff_notes: noteText || lane?.session_handoff_notes || '',
              handoff_notes: [
                ...(Array.isArray(lane?.handoff_notes) ? lane.handoff_notes : []),
                {
                  kind: 'subagent-stop',
                  id: agentId,
                  type: input?.agent_type || activeAgent?.type || 'unknown',
                  at: stoppedAt,
                  note: noteText,
                },
              ],
            },
          }
        : current.lanes;

      return {
        ...current,
        lanes: nextLanes,
        active_agents: nextAgents,
        recent_agents: appendRecent(current.recent_agents, {
          kind: 'subagent-stop',
          id: agentId,
          type: input?.agent_type || 'unknown',
          at: stoppedAt,
          lane_id: laneId,
        }),
        last_event: {
          name: 'SubagentStop',
          at: stoppedAt,
        },
      };
    });

    try { updateHudLine(state, updatedRuntime); } catch { /* HUD not installed */ }

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch (error) {
    handleHookError(error, 'subagent-stop', rootCwd);
  }
}

main();
