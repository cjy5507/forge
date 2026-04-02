#!/usr/bin/env node
// Forge Hook: PreToolUse (Write|Edit) — reminds agents to verify before writing code

import { readFileSync, existsSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';

async function main() {
  const input = await readStdin();

  const stateFile = '.forge/state.json';
  if (!existsSync(stateFile)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));

    // Only enforce during development phases (3+)
    if (state.phase < 3) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    console.log(JSON.stringify({
      continue: true,
      additionalContext: '[Forge Fact Checker] Writing code — have you verified? (1) imports exist (2) APIs confirmed via context7 (3) types match contracts (4) code-rules.md followed. No Evidence = No Code.'
    }));
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
