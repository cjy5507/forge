#!/usr/bin/env node
// Forge Hook: PreCompact — saves critical state checkpoint before context compaction

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';

async function main() {
  await readStdin();

  const stateFile = '.forge/state.json';
  if (!existsSync(stateFile)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));

    // Save checkpoint
    const checkpointDir = '.forge/checkpoints';
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
    writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));

    // Keep only last 10 checkpoints
    const { readdirSync, unlinkSync } = await import('fs');
    const files = readdirSync(checkpointDir)
      .filter(f => f.startsWith('checkpoint-'))
      .sort()
      .reverse();

    for (const file of files.slice(10)) {
      unlinkSync(`${checkpointDir}/${file}`);
    }

    console.log(JSON.stringify({
      continue: true,
      additionalContext: `[Forge] Context checkpoint saved. Phase: ${state.phase}/6 (${state.phase_name}). Holes: ${checkpoint.holes_count}. Tasks: ${checkpoint.tasks_count}.`
    }));
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
