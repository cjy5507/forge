#!/usr/bin/env node
// Forge Hook: PreCompact — saves critical state checkpoint before context compaction
//
// Host compatibility: This script handles the Claude Code PreCompact event,
// which fires before the host trims the conversation context window.  On hosts
// that do not support PreCompact, readStdin() rejects and the catch block
// returns { continue: true } — no checkpoint is written and the host continues.
// The checkpoint is an optimisation; skipping it never causes data loss.

import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { readForgeState, compactForgeContext, readRuntimeState, writeJsonFile } from './lib/forge-state.mjs';

async function main() {
  const envTier = (process.env.FORGE_TIER || '').toLowerCase();
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
  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {

    // Save checkpoint
    const checkpointDir = `${cwd}/.forge/checkpoints`;
    if (!existsSync(checkpointDir)) {
      mkdirSync(checkpointDir, { recursive: true });
    }

    const checkpoint = {
      timestamp: new Date().toISOString(),
      phase: state.phase,
      phase_name: state.phase_name,
      project: state.project,
      spec_approved: state.spec_approved,
      design_approved: state.design_approved,
      holes_count: state.holes?.length ?? 0,
      tasks_count: state.tasks?.length ?? 0,
      pr_queue_count: state.pr_queue?.length ?? 0
    };

    const checkpointFile = `${checkpointDir}/checkpoint-${Date.now()}.json`;
    writeJsonFile(checkpointFile, checkpoint);

    // Keep only last 10 checkpoints
    const files = readdirSync(checkpointDir)
      .filter(f => f.startsWith('checkpoint-'))
      .sort()
      .reverse();

    for (const file of files.slice(10)) {
      unlinkSync(`${checkpointDir}/${file}`);
    }

    const runtime = readRuntimeState(cwd);
    const context = compactForgeContext(state, runtime);

    console.log(JSON.stringify({
      continue: true,
      additionalContext: `[Forge] Context checkpoint saved. ${context}`
    }));
  } catch (error) {
    handleHookError(error, 'context-manager', cwd);
  }
}

main();
