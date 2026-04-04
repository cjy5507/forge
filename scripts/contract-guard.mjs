#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — adaptive contract reminder

import { existsSync, readdirSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { detectWriteRisk, readActiveTier, readForgeState, tierAtLeast } from './lib/forge-state.mjs';

async function main() {
  const envTier = process.env.FORGE_TIER;
  if (envTier === 'off' || envTier === 'light') {
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
  const contractsDir = `${cwd}/.forge/contracts`;

  if (!tierAtLeast(tier, 'medium') || (tier === 'medium' && risk.level === 'low')) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  if (!existsSync(contractsDir)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const contracts = readdirSync(contractsDir).filter(file =>
      file.endsWith('.ts') || file.endsWith('.json') || file.endsWith('.mjs') || file.endsWith('.zod')
    );
    if (contracts.length === 0) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `[Forge] contracts ${tier} ${risk.level} → ${contracts.join(', ')}`,
      },
    }));
  } catch (error) {
    handleHookError(error, 'contract-guard', cwd);
  }
}

main();
