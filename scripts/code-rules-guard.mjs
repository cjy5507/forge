#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — injects code-rules context after code changes

import { existsSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';

  try {
    const rulesFile = `${cwd}/.forge/code-rules.md`;
    if (!existsSync(rulesFile)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: '[Forge Code Rules] Re-check naming, imports, file structure, and patterns against .forge/code-rules.md before moving on.',
      },
    }));
  } catch (error) {
    handleHookError(error, 'code-rules-guard');
  }
}

main();
