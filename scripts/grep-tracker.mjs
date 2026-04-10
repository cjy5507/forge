#!/usr/bin/env node
// Forge Hook: PostToolUse/Grep — feedback on grep result quality
//
// After grep execution, provides feedback:
// - 0 results → suggest LSP find_definition
// - 100+ results → suggest narrowing pattern or LSP findReferences
// - 1-99 results → silent pass-through
// Never blocks. Only active at tier >= medium.

import { runHook } from './lib/hook-runner.mjs';
import { resolveForgeBaseDir } from './lib/forge-io.mjs';
import { readForgeState } from './lib/forge-session.mjs';
import { readActiveTier, readEnvTier, tierAtLeast } from './lib/forge-tiers.mjs';

const MANY_RESULTS_THRESHOLD = 150;

function countGrepResults(input) {
  // PostToolUse input shape varies — try known patterns
  const result = input?.tool_result;
  if (typeof result === 'string') {
    return result.split('\n').filter(Boolean).length;
  }
  if (typeof input?.tool_output === 'string') {
    return input.tool_output.split('\n').filter(Boolean).length;
  }
  // Count from content array if available
  if (Array.isArray(result)) {
    return result.length;
  }
  return -1; // unknown shape
}

runHook(async (input) => {
  const envTier = readEnvTier();
  if (envTier === 'off') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const cwd = input?.cwd || '.';
  const rootCwd = resolveForgeBaseDir(cwd);
  const state = readForgeState(rootCwd);
  const tier = readActiveTier(rootCwd, state, input);

  if (!tierAtLeast(tier, 'medium')) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const count = countGrepResults(input);

  // Unknown shape or normal range → pass through
  if (count < 0 || (count > 0 && count < MANY_RESULTS_THRESHOLD)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const pattern = input?.tool_input?.pattern || '';
  let hint = '';

  if (count === 0) {
    hint = `Grep for "${pattern}" returned 0 results. LSP find_definition may locate the symbol directly without pattern matching.`;
  } else {
    hint = `Grep returned ${count}+ matches — pattern may be too broad. Consider LSP findReferences for precise symbol usage, or narrow the pattern with file type filters.`;
  }

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `[Forge Grep] ${hint}`,
    },
  }));
}, { name: 'grep-tracker' });
