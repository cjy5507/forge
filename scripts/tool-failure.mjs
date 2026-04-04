#!/usr/bin/env node
// Forge Hook: PostToolUseFailure — low-cost failure logging with tier-aware guidance

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  appendRecent,
  isProjectActive,
  readActiveTier,
  readForgeState,
  resolveForgeBaseDir,
  resolvePhase,
  resolveRuntimeLaneContext,
  updateRuntimeState,
} from './lib/forge-state.mjs';

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

function classifyFailure(input) {
  const toolName = String(input?.tool_name || 'unknown');
  const toolInput = JSON.stringify(input?.tool_input || {});
  const errorText = String(input?.error || input?.tool_error || input?.stderr || 'unknown failure');
  const combined = `${toolName} ${toolInput} ${errorText}`.toLowerCase();

  if (toolName === 'Bash' && /(vitest|jest|playwright|npm test|pnpm test|yarn test|test)/.test(combined)) {
    return 'Test command failed. Reproduce one failing target, capture the first real assertion or stack trace, then retry narrowly.';
  }

  if (toolName === 'Bash' && /(next build|build|tsc|typecheck)/.test(combined)) {
    return 'Build or typecheck failed. Fix the first compile error, then re-run the smallest proving command.';
  }

  if (toolName === 'Bash' && /(eslint|lint)/.test(combined)) {
    return 'Lint failed. Fix reported violations before retrying.';
  }

  if (toolName === 'Bash' && /(git worktree|rebase|merge)/.test(combined)) {
    return 'Git/worktree operation failed. Inspect repo state before retrying.';
  }

  // 'Task' and 'Agent' are Claude Code-specific tool names for sub-agent
  // delegation.  On other hosts these tool names will not appear, so this
  // branch simply will not match — the fallthrough default message is safe.
  if (toolName === 'Task' || toolName === 'Agent') {
    return 'Delegation failed. Tighten scope and acceptance criteria before retrying.';
  }

  return 'Tool execution failed. Adjust approach before repeating the same command.';
}

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
  const rootCwd = resolveForgeBaseDir(cwd);
  const state = readForgeState(rootCwd);
  const tier = readActiveTier(rootCwd, state, input);

  try {
    const commandText = String(input?.tool_input?.command || input?.error || '');
    const testLike = /(test|vitest|jest|playwright)/i.test(commandText);
    const guidance = classifyFailure(input);

    // Only write to runtime.json if there's an active Forge project
    if (!state || !isProjectActive(state)) {
      console.log(JSON.stringify({
        continue: true,
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: 'PostToolUseFailure',
          additionalContext: `[Forge] ${guidance}`,
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
      guidance,
    };

    // Phase mismatch check — skip lane modifications to prevent orphaned records
    const phase = state ? resolvePhase(state) : null;
    const phaseMismatch = phase?.mismatch ?? false;

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
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: (tier === 'light' ? '[Forge] failure logged' : `[Forge Failure Loop] ${guidance}`) + mismatchWarning,
      },
    }));
  } catch (error) {
    handleHookError(error, 'tool-failure', rootCwd);
  }
}

main();
