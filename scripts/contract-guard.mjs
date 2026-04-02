#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — reminds to verify contract compliance after writing

import { readFileSync, existsSync, readdirSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';

async function main() {
  const input = await readStdin();

  const contractsDir = '.forge/contracts';
  if (!existsSync(contractsDir)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const contracts = readdirSync(contractsDir).filter(f => f.endsWith('.ts'));
    if (contracts.length === 0) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    console.log(JSON.stringify({
      continue: true,
      additionalContext: `[Forge Contract Guard] Code written. Verify against contracts: ${contracts.join(', ')}. Any violation = PR rejected.`
    }));
  } catch (error) {
    handleHookError(error, 'contract-guard');
  }
}

main();
