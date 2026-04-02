#!/usr/bin/env node
// Forge Hook: UserPromptSubmit — detects forge-related messages and updates adaptive tier/runtime

import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  compactForgeContext,
  readForgeState,
  resolvePhase,
  updateAdaptiveTier,
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

  let context = '[Forge] full intake 0/7 ×spec ×design';
  const state = readForgeState(cwd);

  if (state) {
    try {
      const normalized = writeForgeState(cwd, state);
      const adaptive = updateAdaptiveTier(cwd, { state: normalized, message });
      const phase = resolvePhase(normalized);
      const currentSkill = phase.id === 'complete' ? 'status' : phase.id;
      context = `${compactForgeContext(normalized, adaptive.runtime)} → forge:${currentSkill} [${adaptive.recommendedAgents.join(', ')}]`;
    } catch (error) {
      handleHookError(error, 'phase-detector');
      return;
    }
  } else {
    updateAdaptiveTier(cwd, { state: null, message });
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
