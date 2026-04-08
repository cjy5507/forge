#!/usr/bin/env node
// Forge Hook: PostToolUseFailure — low-cost failure logging with tier-aware guidance

import { runHook } from './lib/hook-runner.mjs';
import { appendRecent, resolveForgeBaseDir } from './lib/forge-io.mjs';
import { readForgeState, readRuntimeState, recordDecisionTrace, recordRecoveryState, updateRuntimeState } from './lib/forge-session.mjs';
import { isProjectActive } from './lib/forge-interaction.mjs';
import { readActiveTier } from './lib/forge-tiers.mjs';
import { resolvePhase } from './lib/forge-phases.mjs';
import { resolveRuntimeLaneContext } from './lib/forge-lanes.mjs';
import { readEnvTier } from './lib/forge-tiers.mjs';
import { classifyToolFailure } from './lib/forge-tooling.mjs';
import { renderRecoverySummary } from './lib/forge-recovery.mjs';

function summarizeLaneFailure(input) {
  const toolName = String(input?.tool_name || 'unknown');
  const toolInput = JSON.stringify(input?.tool_input || {});
  const errorText = String(input?.error || input?.tool_error || input?.stderr || 'unknown failure').trim();
  const combined = `${toolName} ${toolInput} ${errorText}`.toLowerCase();

  if (toolName === 'Bash' && /(git worktree|rebase|merge|conflict)/.test(combined)) {
    return errorText || 'Git/worktree operation failed.';
  }

  if (/(review|request-changes|changes requested|pr review)/.test(combined)) {
    return errorText || 'Review operation failed.';
  }

  return '';
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

  const commandText = String(input?.tool_input?.command || input?.error || '');
  const testLike = /(test|vitest|jest|playwright)/i.test(commandText);
  const classification = classifyToolFailure(input, { cwd: rootCwd, env: process.env });
  const guidance = classification.guidance;

  // Only write to runtime.json if there's an active Forge project
  if (!state || !isProjectActive(state)) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: `[Forge] ${guidance}${classification.suggestedCommand ? ` Retry: ${classification.suggestedCommand}` : ''}`,
      },
    }));
    return;
  }

  const laneFailureReason = summarizeLaneFailure(input);
  const toolInput = input?.tool_input || {};
  const truncatedInput = JSON.stringify(toolInput).length > 500
    ? { _truncated: true, summary: JSON.stringify(toolInput).slice(0, 500) }
    : toolInput;
  const entry = {
    at: new Date().toISOString(),
    tool_name: input?.tool_name || 'unknown',
    tool_input: truncatedInput,
    error: input?.error || input?.tool_error || input?.stderr || 'unknown failure',
    category: classification.category,
    guidance,
    suggested_command: classification.suggestedCommand,
  };

  // Phase mismatch check — skip lane modifications to prevent orphaned records
  const phase = state ? resolvePhase(state) : null;
  const phaseMismatch = phase?.mismatch ?? false;
  const currentRuntime = state ? readRuntimeState(rootCwd, { state }) : null;
  const resolvedLaneContext = currentRuntime ? resolveRuntimeLaneContext(currentRuntime, rootCwd, cwd) : { laneId: '', lane: null };
  const resolvedLaneId = phaseMismatch ? '' : (resolvedLaneContext.laneId || '');

  updateRuntimeState(rootCwd, current => {
    const { laneId, lane } = resolveRuntimeLaneContext(current, rootCwd, cwd);
    const laneEntry = laneId ? { ...entry, lane_id: laneId } : entry;
    const nextLanes = !phaseMismatch && laneId && laneFailureReason
      ? {
          ...current.lanes,
          [laneId]: {
            ...lane,
            status: 'blocked',
            blocked_reason: laneFailureReason,
            session_handoff_notes: laneFailureReason,
            last_event_at: entry.at,
            handoff_notes: [
              ...(Array.isArray(lane?.handoff_notes) ? lane.handoff_notes : []),
              {
                kind: 'tool-failure',
                at: entry.at,
                tool_name: laneEntry.tool_name,
                note: laneFailureReason,
              },
            ],
          },
        }
      : current.lanes;

    return {
      ...current,
      active_tier: tier,
      lanes: nextLanes,
      recent_failures: appendRecent(current.recent_failures, laneEntry),
      stats: {
        ...current.stats,
        failure_count: (current.stats.failure_count || 0) + 1,
        test_runs: testLike ? (current.stats.test_runs || 0) + 1 : current.stats.test_runs || 0,
        test_failures: testLike ? (current.stats.test_failures || 0) + 1 : current.stats.test_failures || 0,
      },
      last_event: {
        name: 'PostToolUseFailure',
        at: entry.at,
      },
    };
  });

  const mismatchWarning = phaseMismatch
    ? ` [Warning: phase "${phase.id}" is not in the ${phase.mode} sequence — lane updates skipped]`
    : '';
  recordDecisionTrace(rootCwd, {
    scope: 'recovery',
    kind: `failure_${classification.category}`,
    target: String(input?.tool_name || 'unknown'),
    summary: guidance,
    inputs: [
      commandText,
      classification.suggestedCommand,
    ].filter(Boolean),
  });
  const recovery = recordRecoveryState(rootCwd, {
    at: entry.at,
    category: classification.category,
    lane_id: resolvedLaneId,
    phase_id: phase?.id || '',
    command: commandText,
    guidance,
    suggested_command: classification.suggestedCommand,
    retry_count: 1,
    status: 'active',
    summary: guidance,
  });
  const recoverySummary = renderRecoverySummary(recovery.recovery.latest);
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'PostToolUseFailure',
      additionalContext: (tier === 'light'
        ? `[Forge] failure logged (${classification.category})`
        : `[Forge Failure Loop] ${guidance}${classification.suggestedCommand ? ` Retry: ${classification.suggestedCommand}` : ''}${recoverySummary ? ` State: ${recoverySummary}` : ''}`) + mismatchWarning,
    },
  }));
}, { name: 'tool-failure' });
