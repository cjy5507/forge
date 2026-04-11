#!/usr/bin/env node
// Forge Hook: UserPromptSubmit — detects forge-related messages and updates adaptive tier/runtime

import { existsSync } from 'fs';
import { basename, resolve } from 'path';
import { runHook } from './lib/hook-runner.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { buildContinueDirective, createSkillDirective } from './lib/forge-continue.mjs';
import { deriveForgeRequest } from './lib/forge-phase-routing.mjs';
import { resolveActiveForgePrompt } from './lib/forge-prompt-continue.mjs';
import { PHASE_SEQUENCE } from './lib/forge-phases.mjs';
import { detectHostId } from './lib/forge-host.mjs';
import { ensureForgeProjectLayout, getRuntimePath, getStatePath } from './lib/forge-io.mjs';
import { readForgeState, updateRuntimeHookContext, updateAdaptiveTier, writeForgeState } from './lib/forge-session.mjs';
import { isProjectActive } from './lib/forge-interaction.mjs';
import { updateHudLine } from './lib/forge-hud.mjs';

function shouldBootstrapForgeProject(request) {
  if (request.explicitSkill === 'info' || request.explicitSkill === 'continue' || request.explicitSkill === 'cancel') {
    return false;
  }

  if (request.naturalSkill === 'info' || request.naturalSkill === 'continue') {
    return false;
  }

  return request.explicitSkill === 'ignite' || request.naturalMode !== null;
}

function inferBootstrapMode(request) {
  if (request.naturalMode === 'repair' || request.naturalMode === 'express') {
    return request.naturalMode;
  }

  return 'build';
}

function bootstrapForgeProject(cwd, request) {
  ensureForgeProjectLayout(cwd);

  const statePath = getStatePath(cwd);
  if (existsSync(statePath)) {
    return readForgeState(cwd);
  }

  const now = new Date().toISOString();
  return writeForgeState(cwd, {
    version: '0.1.0',
    project: basename(resolve(cwd)),
    phase: 'intake',
    phase_id: 'intake',
    phase_name: 'intake',
    tier: 'medium',
    mode: inferBootstrapMode(request),
    status: 'pending',
    created_at: now,
    client_name: '',
    agents_active: [],
    spec_approved: false,
    design_approved: false,
    tasks: [],
    holes: [],
    pr_queue: [],
  });
}

runHook(async (input) => {
  const cwd = input?.cwd || '.';
  const message = String(input?.message || input?.content || '');
  const hostId = detectHostId(input, process.env);
  let state = readForgeState(cwd);
  const projectActive = Boolean(state && isProjectActive(state));
  const request = deriveForgeRequest(message, { projectActive });

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

  // If the project is complete/delivered and the user wants a NEW build/repair, treat as fresh ignite
  if (state && !projectActive && (request.naturalMode || request.explicitSkill === 'ignite')) {
    state = null;
  }

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
          naturalSkill: request.naturalSkill,
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
    if (shouldBootstrapForgeProject(request)) {
      state = bootstrapForgeProject(cwd, request);
    }

    if (state) {
      updateAdaptiveTier(cwd, { state, message, hostId, eventName: 'prompt.submit' });
    }
    // No active project — mode detection still routes through ignite, but with an explicit hint.
    if (request.naturalMode) {
      targetSkill = 'ignite';
      context = `${context}\n[Forge] Requested mode: ${request.naturalMode}`;
      prebuiltOutput = createSkillDirective(targetSkill, context, {
        reason: `Detected ${request.naturalMode} request from user message.`,
      });
    } else if (request.explicitSkill) {
      targetSkill = request.explicitSkill;
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
