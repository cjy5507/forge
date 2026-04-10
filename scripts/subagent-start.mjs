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

import { runHook } from './lib/hook-runner.mjs';
import { appendRecent, resolveForgeBaseDir } from './lib/forge-io.mjs';
import { readForgeState, readRuntimeState, updateRuntimeState } from './lib/forge-session.mjs';
import { isProjectActive } from './lib/forge-interaction.mjs';
import { readActiveTier, recommendedAgentsFor } from './lib/forge-tiers.mjs';
import { resolveRuntimeLaneContext } from './lib/forge-lanes.mjs';
import { resolvePhase } from './lib/forge-phases.mjs';
import { updateHudLine } from './lib/forge-hud.mjs';
import { readEnvTier, tierAtLeast } from './lib/forge-tiers.mjs';
import { isCodeWorkingAgent, buildLspContextHint, buildSmartContextHint, buildCrossLaneContext } from './lib/forge-lsp.mjs';

runHook(async (input) => {
  const envTier = readEnvTier();
  if (envTier === 'off') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const cwd = input?.cwd || '.';
  const rootCwd = resolveForgeBaseDir(cwd);
  const state = readForgeState(rootCwd);
  const tier = readActiveTier(rootCwd, state, input);

  if (!tierAtLeast(tier, 'light')) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  // Only write to runtime.json if there's an active Forge project
  if (!state || !isProjectActive(state)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const startedAt = new Date().toISOString();
  const phaseId = state ? resolvePhase(state).id : 'develop';
  const runtime = readRuntimeState(rootCwd);
  const { laneId, lane } = resolveRuntimeLaneContext(runtime, rootCwd, cwd);
  const taskType = runtime.last_task_type || 'feature';
  const recommended = recommendedAgentsFor({ tier, taskType, phaseId, runtime });
  const agentId = input?.agent_id || `unknown-${Date.now()}`;
  const agentType = input?.agent_type || 'unknown';

  const updatedRuntime = updateRuntimeState(rootCwd, current => {
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
      // Agent Token Ledger: init entry for tool call tracking
      tool_ledger: (() => {
        try {
          const ledger = { ...(current.tool_ledger || {}) };
          ledger[agentId] = {
            type: agentType,
            started_at: startedAt,
            finished_at: '',
            tool_calls: 0,
            lane_id: laneId,
          };
          // Keep max 10 entries — remove oldest by started_at
          const keys = Object.keys(ledger);
          if (keys.length > 10) {
            const sorted = keys.sort((a, b) =>
              (ledger[a].started_at || '').localeCompare(ledger[b].started_at || ''),
            );
            for (let i = 0; i < keys.length - 10; i++) delete ledger[sorted[i]];
          }
          return ledger;
        } catch { return current.tool_ledger || {}; }
      })(),
      last_event: {
        name: 'SubagentStart',
        at: startedAt,
      },
    };
  });

  try { updateHudLine(state, updatedRuntime); } catch { /* HUD not installed */ }

  if (!state || !tierAtLeast(tier, 'medium')) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  // Build analysis context when codebase-memory tools are available
  let analysisHint = '';
  const analysisPhases = ['design', 'isolate', 'reproduce', 'develop'];
  if (analysisPhases.includes(phaseId) && recommended.tools?.length) {
    analysisHint = ` | analysis: use ${recommended.tools.join(', ')} (search_graph, trace_call_path, get_architecture) for codebase context`;
  }

  // Surface layer info when structured recommendation is available
  let layerHint = '';
  if (recommended.layer1_team?.length) {
    layerHint = ` | team: [${recommended.layer1_team.join(', ')}]`;
  }

  // Build lane-scoped context injection
  let laneContext = '';
  if (laneId && lane) {
    const scope = Array.isArray(lane.scope) ? lane.scope : [];
    const deps = Array.isArray(lane.dependencies) ? lane.dependencies : [];
    const modelHint = lane.model_hint || '';
    const parts = [`[Lane:${laneId}]`];
    if (scope.length) parts.push(`scope:[${scope.join(',')}]`);
    if (deps.length) parts.push(`deps:[${deps.join(',')}]`);
    if (modelHint) parts.push(`model:${modelHint}`);
    // Include task file content if available (max 2000 chars)
    if (lane.task_file) {
      try {
        const { readFileSync } = await import('fs');
        const content = readFileSync(lane.task_file, 'utf8').slice(0, 2000);
        if (content) parts.push(`task:\n${content}`);
      } catch { /* task file not found */ }
    }
    laneContext = ` | ${parts.join(' ')}`;
  }

  // LSP pre-delegation: inject LSP navigation hint for code-working agents
  let lspHint = '';
  try {
    const hint = buildLspContextHint(agentType, tier);
    if (hint) lspHint = ` | ${hint}`;
  } catch { /* LSP hint is non-fatal per R3 */ }

  // Smart Context Injection: pre-resolve exports from task file references
  let smartCtx = '';
  try {
    if (isCodeWorkingAgent(agentType) && lane?.task_file) {
      const ctx = buildSmartContextHint(lane.task_file, rootCwd);
      if (ctx) smartCtx = ` | ${ctx}`;
    }
  } catch { /* smart context is non-fatal */ }

  // Cross-Lane Dependency Pre-Resolve: inject dependency lane exports
  let crossLaneCtx = '';
  try {
    if (laneId && lane?.dependencies?.length) {
      const ctx = buildCrossLaneContext(lane, updatedRuntime, rootCwd);
      if (ctx) crossLaneCtx = ` | ${ctx}`;
    }
  } catch { /* cross-lane context is non-fatal */ }

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: `[Forge] ${tier} ${phaseId} [${recommended.join(', ')}]${layerHint}${analysisHint}${laneContext}${lspHint}${smartCtx}${crossLaneCtx}`,
    },
  }));
}, { name: 'subagent-start' });
