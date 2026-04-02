#!/usr/bin/env node
// Forge Hook: PostToolUseFailure — low-cost failure logging with tier-aware guidance

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { appendRecent, readActiveTier, readForgeState, updateRuntimeState } from './lib/forge-state.mjs';

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

  const input = await readStdin();
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);
  const tier = readActiveTier(cwd, state, input);

  try {
    const commandText = String(input?.tool_input?.command || input?.error || '');
    const testLike = /(test|vitest|jest|playwright)/i.test(commandText);
    const guidance = classifyFailure(input);
    const entry = {
      at: new Date().toISOString(),
      tool_name: input?.tool_name || 'unknown',
      tool_input: input?.tool_input || {},
      error: input?.error || input?.tool_error || input?.stderr || 'unknown failure',
      guidance,
    };

    updateRuntimeState(cwd, current => ({
      ...current,
      active_tier: tier,
      recent_failures: appendRecent(current.recent_failures, entry),
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
    }));

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: tier === 'light' ? '[Forge] failure logged' : `[Forge Failure Loop] ${guidance}`,
      },
    }));
  } catch (error) {
    handleHookError(error, 'tool-failure');
  }
}

main();
