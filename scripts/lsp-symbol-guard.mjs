#!/usr/bin/env node
// Forge Hook: PreToolUse/Grep — soft-redirect symbol-like grep patterns to LSP
//
// When a grep pattern matches a code symbol (camelCase, PascalCase, snake_case),
// suggests LSP alternatives via additionalContext. Never blocks — always returns
// continue: true. Only active at tier >= medium.

import { runHook } from './lib/hook-runner.mjs';
import { resolveForgeBaseDir } from './lib/forge-io.mjs';
import { readForgeState } from './lib/forge-session.mjs';
import { readActiveTier, readEnvTier, tierAtLeast } from './lib/forge-tiers.mjs';
import { isSymbolPattern, buildSymbolRedirectHint } from './lib/forge-lsp.mjs';

runHook(async (input) => {
  const envTier = readEnvTier();
  if (envTier === 'off') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const pattern = input?.tool_input?.pattern || '';
  if (!isSymbolPattern(pattern)) {
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

  const hint = buildSymbolRedirectHint(pattern);
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `[Forge LSP] ${hint}`,
    },
  }));
}, { name: 'lsp-symbol-guard' });
