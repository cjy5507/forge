#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — full-tier code-rules reminder

import { existsSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { detectWriteRisk, readActiveTier, readForgeState, tierAtLeast } from './lib/forge-state.mjs';

async function main() {
  const envTier = (process.env.FORGE_TIER || '').toLowerCase();
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
  const state = readForgeState(cwd);
  const tier = readActiveTier(cwd, state, input);
  const risk = detectWriteRisk(input);

  if (!tierAtLeast(tier, 'full') || risk.level === 'low') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

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
        additionalContext: `[Forge] rules full ${risk.level} → re-check .forge/code-rules.md`,
      },
    }));
  } catch (error) {
    handleHookError(error, 'code-rules-guard', cwd);
  }
}

main();
