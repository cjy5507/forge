#!/usr/bin/env node
// Forge Hook: PreCompact — emits compact adaptive context before compaction.
//
// Host compatibility: This script handles the Claude Code PreCompact event.
// On hosts that do not support PreCompact, readStdin() rejects and the catch
// block returns { continue: true }.

import { runHook } from './lib/hook-runner.mjs';
import { readForgeState, compactForgeContext, readRuntimeState } from './lib/forge-session.mjs';
import { readEnvTier } from './lib/forge-tiers.mjs';

runHook(async (input) => {
  const envTier = readEnvTier();
  if (envTier === 'off' || envTier === 'light') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const cwd = input?.cwd || '.';

  const state = readForgeState(cwd);
  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const runtime = readRuntimeState(cwd);
  const context = compactForgeContext(state, runtime);

  console.log(JSON.stringify({
    continue: true,
    additionalContext: `[Forge] ${context}`
  }));
}, { name: 'context-manager' });
