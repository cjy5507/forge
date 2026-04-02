#!/usr/bin/env node
// Forge Hook: UserPromptSubmit — detects forge-related messages and injects phase context

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  readForgeState,
  resolvePhase,
  summarizePendingWork,
  writeForgeState,
} from './lib/forge-state.mjs';

const ENGLISH_TRIGGERS = [/\bforge\b/i, /\/forge\b/i, /\bforge:/i];
const KOREAN_TRIGGERS = ['포지', '포지:', '/포지'];

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';
  const message = String(input?.message || input?.content || '');
  const lowered = message.toLowerCase();

  const isForgeRequest =
    ENGLISH_TRIGGERS.some(re => re.test(message)) ||
    KOREAN_TRIGGERS.some(t => lowered.includes(t));

  if (!isForgeRequest) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  let context = '[Forge] New project request detected. Use forge:intake to begin.';

  const state = readForgeState(cwd);
  if (state) {
    try {
      const normalized = writeForgeState(cwd, state);
      const phase = resolvePhase(normalized);
      const currentSkill = phase.id === 'complete' ? 'status' : phase.id;
      const pending = summarizePendingWork(normalized);
      context = `[Forge] Resuming "${normalized.project}". Current phase: ${phase.id} (#${phase.index}). Pending: ${pending.join(', ')}. Use forge:${currentSkill} to continue.`;
    } catch (error) {
      handleHookError(error, 'phase-detector');
      return;
    }
  }

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: context,
    },
  }));
}

main();
