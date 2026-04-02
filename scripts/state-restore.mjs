#!/usr/bin/env node
// Forge Hook: SessionStart — restores .forge/ state and injects current phase context

import { readFileSync, existsSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';

async function main() {
  await readStdin();

  const stateFile = '.forge/state.json';
  if (!existsSync(stateFile)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    const phase = typeof state.phase === 'number' ? state.phase : 0;
    const phaseName = typeof state.phase_name === 'string' ? state.phase_name : 'intake';
    const holes = state.holes?.length ?? 0;

    const context = [
      `[Forge] Active project: ${state.project || 'unnamed'}`,
      `Phase: ${phase}/7 (${phaseName})`,
      `Spec approved: ${state.spec_approved ? 'Yes' : 'No'}`,
      `Design approved: ${state.design_approved ? 'Yes' : 'No'}`,
      holes > 0 ? `Known holes: ${holes}` : '',
    ].filter(Boolean).join(' | ');

    console.log(JSON.stringify({
      continue: true,
      additionalContext: context
    }));
  } catch (error) {
    handleHookError(error, 'state-restore');
  }
}

main();
