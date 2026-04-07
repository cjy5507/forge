#!/usr/bin/env node
// Forge Hook: UserPromptSubmit — detects forge-related messages and updates adaptive tier/runtime

import { existsSync } from 'fs';
import { runHook } from './lib/hook-runner.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { buildContinueDirective, createSkillDirective } from './lib/forge-continue.mjs';
import { deriveForgeRequest } from './lib/forge-phase-routing.mjs';
import { resolveActiveForgePrompt } from './lib/forge-prompt-continue.mjs';
import {
  PHASE_SEQUENCE,
  detectHostId,
  getRuntimePath,
  isProjectActive,
  readForgeState,
  updateHudLine,
  updateRuntimeHookContext,
  updateAdaptiveTier,
} from './lib/forge-state.mjs';

runHook(async (input) => {
  const cwd = input?.cwd || '.';
  const message = String(input?.message || input?.content || '');
  const hostId = detectHostId(input, process.env);
  const state = readForgeState(cwd);
  const projectActive = Boolean(state && isProjectActive(state));
  const request = deriveForgeRequest(message);

  if (!request.isForgeRequest) {
    if (state && existsSync(getRuntimePath(cwd))) {
      try {
        updateAdaptiveTier(cwd, { state, message, hostId, eventName: 'prompt.submit' });
      } catch (error) {
        handleHookError(error, 'phase-detector', cwd);
        return;
      }
    }
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  let context = `[Forge] full intake 0/${PHASE_SEQUENCE.length - 1} ×spec ×design`;
  let targetSkill = 'ignite';
  let prebuiltOutput = '';

  if (state) {
    try {
      const adaptive = updateAdaptiveTier(cwd, { state, message, hostId, eventName: 'prompt.submit' });
      const resolved = resolveActiveForgePrompt({
        cwd,
        state,
        runtime: adaptive.runtime,
        request: {
          explicitSkill: request.explicitSkill,
          naturalMode: request.naturalMode,
          message,
        },
        projectActive,
        recommendedAgents: adaptive.recommendedAgents,
      });
      targetSkill = resolved.currentSkill;
      context = resolved.context;
      const updatedRuntime = updateRuntimeHookContext(cwd, {
        hostId,
        eventName: 'prompt.submit',
        resumed: resolved.resumeSurfaceRequested,
        contextBuilder() {
          return resolved.compactOnly;
        },
      });
      try { updateHudLine(state, updatedRuntime); } catch { /* HUD not installed */ }

      if (resolved.resumeSurfaceRequested) {
        const directive = resolved.buildDirective(updatedRuntime);
        targetSkill = directive.skill;
        prebuiltOutput = directive.additionalContext;
      }
    } catch (error) {
      handleHookError(error, 'phase-detector', cwd);
      return;
    }
  } else {
    updateAdaptiveTier(cwd, { state: null, message, hostId, eventName: 'prompt.submit' });
    // No active project — natural language triggers ignite directly
    if (request.explicitSkill) {
      targetSkill = request.explicitSkill;
    } else if (request.naturalMode) {
      targetSkill = 'ignite';
    }
  }

  // Emit skill invocation directive — LLM must invoke the target skill
  const output = prebuiltOutput || createSkillDirective(targetSkill, context);

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: output,
    },
  }));
}, { name: 'phase-detector' });
