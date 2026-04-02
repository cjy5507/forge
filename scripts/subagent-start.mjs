#!/usr/bin/env node
// Forge Hook: SubagentStart — tracks live subagents and injects Forge harness context

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  appendRecent,
  readForgeState,
  resolvePhase,
  updateRuntimeState,
} from './lib/forge-state.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  try {
    const startedAt = new Date().toISOString();

    updateRuntimeState(cwd, current => ({
      ...current,
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
      last_event: {
        name: 'SubagentStart',
        at: startedAt,
      },
    }));

    if (!state) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const phase = resolvePhase(state);
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: `[Forge Harness] You are a tracked subagent in phase ${phase.id}. Respect code-rules, keep evidence explicit, and report concrete outputs before stopping.`,
      },
    }));
  } catch (error) {
    handleHookError(error, 'subagent-start');
  }
}

main();
