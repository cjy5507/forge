#!/usr/bin/env node
// Forge Hook: UserPromptSubmit — detects forge-related messages and updates adaptive tier/runtime

import { existsSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  PHASE_SEQUENCE,
  compactForgeContext,
  getRuntimePath,
  readForgeState,
  readRuntimeState,
  resolvePhase,
  updateHudLine,
  updateRuntimeState,
  updateAdaptiveTier,
} from './lib/forge-state.mjs';

const ENGLISH_TRIGGERS = [/\bforge\b/i, /\/forge\b/i, /\bforge:/i];
const KOREAN_TRIGGERS = ['포지', '포지:', '/포지'];

async function main() {
  let input;
  try {
    input = await readStdin();
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  const cwd = input?.cwd || '.';
  const message = String(input?.message || input?.content || '');
  const lowered = message.toLowerCase();
  const state = readForgeState(cwd);

  const isForgeRequest =
    ENGLISH_TRIGGERS.some(re => re.test(message)) ||
    KOREAN_TRIGGERS.some(t => lowered.includes(t));

  if (!isForgeRequest) {
    if (state && existsSync(getRuntimePath(cwd))) {
      try {
        updateAdaptiveTier(cwd, { state, message });
      } catch (error) {
        handleHookError(error, 'phase-detector', cwd);
        return;
      }
    }
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  let context = `[Forge] full intake 0/${PHASE_SEQUENCE.length - 1} ×spec ×design`;

  if (state) {
    try {
      const adaptive = updateAdaptiveTier(cwd, { state, message });
      const phase = resolvePhase(state);
      const runtime = readRuntimeState(cwd);
      let currentSkill = phase.id === 'complete' ? 'status' : phase.id;
      const nextOwner = typeof runtime.next_session_owner === 'string' ? runtime.next_session_owner.trim() : '';

      if ((runtime.customer_blockers?.length || 0) > 0 && nextOwner === 'pm') {
        currentSkill = 'continue';
      } else if (typeof runtime.active_gate === 'string' && runtime.active_gate.trim()) {
        if (runtime.active_gate === 'delivery_readiness' || runtime.active_gate === 'customer_review') {
          currentSkill = 'status';
        }
      }

      const compactOnly = compactForgeContext(state, adaptive.runtime);
      context = `${compactOnly} → forge:${currentSkill} [${adaptive.recommendedAgents.join(', ')}]`;
      const updatedRuntime = updateRuntimeState(cwd, current => ({
        ...current,
        last_compact_context: compactOnly,
      }));
      try { updateHudLine(state, updatedRuntime); } catch { /* HUD not installed */ }
    } catch (error) {
      handleHookError(error, 'phase-detector', cwd);
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
