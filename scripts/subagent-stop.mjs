#!/usr/bin/env node
// Forge Hook: SubagentStop — records subagent completion details for orchestration visibility

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { appendRecent, updateRuntimeState } from './lib/forge-state.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';

  try {
    const stoppedAt = new Date().toISOString();
    const agentId = input?.agent_id || 'unknown';

    updateRuntimeState(cwd, current => {
      const nextAgents = { ...current.active_agents };

      nextAgents[agentId] = {
        ...(nextAgents[agentId] || {}),
        id: agentId,
        type: input?.agent_type || nextAgents[agentId]?.type || 'unknown',
        status: 'stopped',
        stopped_at: stoppedAt,
        agent_transcript_path: input?.agent_transcript_path || '',
        last_message: String(input?.last_assistant_message || '').slice(0, 500),
      };

      return {
        ...current,
        active_agents: nextAgents,
        recent_agents: appendRecent(current.recent_agents, {
          kind: 'subagent-stop',
          id: agentId,
          type: input?.agent_type || 'unknown',
          at: stoppedAt,
        }),
        last_event: {
          name: 'SubagentStop',
          at: stoppedAt,
        },
      };
    });

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch (error) {
    handleHookError(error, 'subagent-stop');
  }
}

main();
