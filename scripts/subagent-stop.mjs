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

import { runHook } from './lib/hook-runner.mjs';
import {
  appendRecent,
  markLaneMergeState,
  markLaneReviewState,
  recordLaneHandoff,
  readActiveTier,
  readForgeState,
  resolveForgeBaseDir,
  resolveRuntimeLaneContext,
  updateHudLine,
  updateRuntimeState,
} from './lib/forge-state.mjs';
import { readEnvTier, tierAtLeast } from './lib/forge-tiers.mjs';

function inferLaneControlSignals(noteText = '') {
  const text = String(noteText || '').trim();
  if (!text) {
    return { reviewState: '', mergeState: '' };
  }

  const normalized = text.toLowerCase();
  const hasChangesRequested = /\bchanges? requested\b|\brequest changes\b|\bneeds changes\b/.test(normalized);
  const hasApproved = !/\bnot approved\b|\bnot lgtm\b/.test(normalized)
    && (/\blgtm\b|\blooks good to me\b|\bapproved\b|\bapproval\b/.test(normalized));

  let reviewState = '';
  if (hasChangesRequested) {
    reviewState = 'changes_requested';
  } else if (hasApproved) {
    reviewState = 'approved';
  }

  let mergeState = '';
  if (/\brebas(?:e|ing)\b|\bneeds? rebase\b|\brebase required\b/.test(normalized)) {
    mergeState = 'rebasing';
  } else if (/\bqueued for merge\b|\bqueue(?:d)? to merge\b/.test(normalized)) {
    mergeState = 'queued';
  } else if (/\bready to merge\b|\bready for merge\b|\bmerge-ready\b|\bmerge ready\b/.test(normalized)) {
    mergeState = 'ready';
  }

  return { reviewState, mergeState };
}

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

  const stoppedAt = new Date().toISOString();
  const agentId = input?.agent_id || 'unknown';

  const updatedRuntime = updateRuntimeState(rootCwd, current => {
    const activeAgent = current.active_agents?.[agentId] || null;
    const { laneId, lane } = resolveRuntimeLaneContext(current, rootCwd, cwd, activeAgent?.lane_id || '');
    const nextAgents = { ...current.active_agents };
    delete nextAgents[agentId];
    const noteText = String(input?.last_assistant_message || '').trim();
    const signals = inferLaneControlSignals(noteText);
    let nextRuntime = {
      ...current,
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

    if (laneId) {
      nextRuntime = recordLaneHandoff(nextRuntime, {
        laneId,
        note: noteText,
        kind: 'subagent-stop',
      });

      if (signals.reviewState) {
        nextRuntime = markLaneReviewState(nextRuntime, {
          laneId,
          reviewState: signals.reviewState,
        });
      }

      if (signals.mergeState) {
        nextRuntime = markLaneMergeState(nextRuntime, {
          laneId,
          mergeState: signals.mergeState,
        });
      }
    }

    return nextRuntime;
  });

  try { updateHudLine(state, updatedRuntime); } catch { /* HUD not installed */ }

  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}, { name: 'subagent-stop' });
