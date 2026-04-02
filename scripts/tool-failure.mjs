#!/usr/bin/env node
// Forge Hook: PostToolUseFailure — records failed tool executions and feeds recovery guidance back into the turn

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { appendRecent, updateRuntimeState } from './lib/forge-state.mjs';

function classifyFailure(input) {
  const toolName = String(input?.tool_name || 'unknown');
  const toolInput = JSON.stringify(input?.tool_input || {});
  const errorText = String(input?.error || input?.tool_error || input?.stderr || 'unknown failure');
  const combined = `${toolName} ${toolInput} ${errorText}`.toLowerCase();

  if (toolName === 'Bash' && /(vitest|jest|playwright|npm test|pnpm test|yarn test|test)/.test(combined)) {
    return 'Test command failed. Reproduce one failing target, capture the first real assertion or stack trace, then change code before re-running the full suite.';
  }

  if (toolName === 'Bash' && /(next build|build|tsc|typecheck)/.test(combined)) {
    return 'Build/typecheck failed. Fix the first compile error, then re-run the narrowest build or typecheck command that proves the correction.';
  }

  if (toolName === 'Bash' && /(eslint|lint)/.test(combined)) {
    return 'Lint failed. Fix the reported violations and align the change with .forge/code-rules.md before re-running lint.';
  }

  if (toolName === 'Bash' && /(git worktree|rebase|merge)/.test(combined)) {
    return 'Git/worktree operation failed. Inspect the branch/worktree state before retrying; do not repeat the same command blindly.';
  }

  if (toolName === 'Task' || toolName === 'Agent') {
    return 'Agent/task execution failed. Inspect the delegated output, tighten the task boundary, and retry with concrete acceptance criteria.';
  }

  return 'Tool execution failed. Identify the first causal error, adjust the approach, and avoid repeating the same failing command unchanged.';
}

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';

  try {
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
      recent_failures: appendRecent(current.recent_failures, entry),
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
        additionalContext: `[Forge Failure Loop] ${guidance}`,
      },
    }));
  } catch (error) {
    handleHookError(error, 'tool-failure');
  }
}

main();
