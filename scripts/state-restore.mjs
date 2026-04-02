#!/usr/bin/env node
// Forge Hook: SessionStart — restores .forge/ state and injects current phase context

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  isProjectActive,
  readForgeState,
  summarizePendingWork,
  writeForgeState,
} from './lib/forge-state.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const normalized = writeForgeState(cwd, state);
    const pending = summarizePendingWork(normalized);

    const context = [
      `[Forge] Active project: ${normalized.project || 'unnamed'}`,
      `Phase: ${normalized.phase_id} (#${normalized.phase_index})`,
      `Status: ${normalized.status}`,
      `Spec approved: ${normalized.spec_approved ? 'Yes' : 'No'}`,
      `Design approved: ${normalized.design_approved ? 'Yes' : 'No'}`,
      isProjectActive(normalized) ? `Pending: ${pending.join(', ')}` : 'Project is not active',
    ].filter(Boolean).join(' | ');

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    }));
  } catch (error) {
    handleHookError(error, 'state-restore');
  }
}

main();
