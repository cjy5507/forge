#!/usr/bin/env node
// Forge Hook: PreToolUse/Read — soft-warn on repeated file reads
//
// When the same file is read 3+ times in a session, suggests using
// offset/limit for partial reads. Never blocks. Only active at tier >= medium.
// Excludes .forge/ internal files and non-code files.

import { runHook } from './lib/hook-runner.mjs';
import { resolveForgeBaseDir } from './lib/forge-io.mjs';
import { readForgeState } from './lib/forge-session.mjs';
import { readActiveTier, readEnvTier, tierAtLeast } from './lib/forge-tiers.mjs';
import { trackFileRead, buildReadBudgetHint, isExcludedFromBudget } from './lib/forge-read-tracker.mjs';

runHook(async (input) => {
  const envTier = readEnvTier();
  if (envTier === 'off') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const filePath = input?.tool_input?.file_path || '';
  if (!filePath || isExcludedFromBudget(filePath)) {
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

  const count = trackFileRead(filePath, rootCwd);
  const hint = buildReadBudgetHint(filePath, count);

  if (!hint) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `[Forge Read Budget] ${hint}`,
    },
  }));
}, { name: 'read-budget-guard' });
