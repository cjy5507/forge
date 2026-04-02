#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — injects contract verification context after code changes

import { existsSync, readdirSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';
  const contractsDir = `${cwd}/.forge/contracts`;

  if (!existsSync(contractsDir)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const contracts = readdirSync(contractsDir).filter(file => file.endsWith('.ts'));
    if (contracts.length === 0) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `[Forge Contract Guard] Verify this edit against contracts: ${contracts.join(', ')}. Contract drift is a reject condition.`,
      },
    }));
  } catch (error) {
    handleHookError(error, 'contract-guard');
  }
}

main();
