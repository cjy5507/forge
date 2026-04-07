#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — adaptive contract reminder

import { existsSync, readdirSync } from 'fs';
import { runHook } from './lib/hook-runner.mjs';
import { detectWriteRisk, readActiveTier, readForgeState, tierAtLeast } from './lib/forge-state.mjs';
import { readEnvTier } from './lib/forge-tiers.mjs';

runHook(async (input) => {
  const envTier = readEnvTier();
  if (envTier === 'off') {
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
}, { name: 'contract-guard' });
