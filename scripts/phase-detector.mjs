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

// Natural-language triggers that imply "build me something" — route to forge:ignite
const BUILD_TRIGGERS = [
  /만들어\s*줘/i, /구축해\s*줘/i, /개발해\s*줘/i, /빌드해\s*줘/i,
  /build\s+(me\s+)?a\b/i, /create\s+(me\s+)?a\b/i, /make\s+(me\s+)?a\b/i,
  /develop\s+(me\s+)?a\b/i,
];
// Natural-language triggers for fix/analyze — route to forge:ignite in repair mode
const REPAIR_TRIGGERS = [
  /고쳐\s*줘/i, /수정해\s*줘/i, /분석해\s*줘/i, /왜\s*안\s*돼/i, /오류/i,
  /fix\s+(this|the|my)\b/i, /debug\s/i, /what'?s\s+wrong/i, /analyze\s/i,
];

function isNaturalForgeRequest(message) {
  if (BUILD_TRIGGERS.some(re => re.test(message))) return 'build';
  if (REPAIR_TRIGGERS.some(re => re.test(message))) return 'repair';
  return null;
}

function createSkillInvocation(skillName, context) {
  return `${context}

[MAGIC KEYWORD: FORGE:${skillName.toUpperCase()}]

You MUST invoke the skill using the Skill tool:
Skill: forge:${skillName}

IMPORTANT: Invoke the skill IMMEDIATELY. Do not summarize, do not ask for confirmation. The Forge pipeline requires autonomous execution.`;
}

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

  const isExplicitForge =
    ENGLISH_TRIGGERS.some(re => re.test(message)) ||
    KOREAN_TRIGGERS.some(t => lowered.includes(t));
  const naturalMode = !isExplicitForge ? isNaturalForgeRequest(message) : null;
  const isForgeRequest = isExplicitForge || naturalMode !== null;

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
  let targetSkill = 'ignite';

  if (state) {
    try {
      const adaptive = updateAdaptiveTier(cwd, { state, message });
      const phase = resolvePhase(state);
      const runtime = readRuntimeState(cwd);
      // Map phase_id to skill name (delivery→deliver, complete→info)
      const PHASE_TO_SKILL = { delivery: 'deliver', complete: 'info' };
      let currentSkill = PHASE_TO_SKILL[phase.id] || phase.id;
      const nextOwner = typeof runtime.next_session_owner === 'string' ? runtime.next_session_owner.trim() : '';

      if ((runtime.customer_blockers?.length || 0) > 0 && nextOwner === 'pm') {
        currentSkill = 'continue';
      } else if (typeof runtime.active_gate === 'string' && runtime.active_gate.trim()) {
        if (runtime.active_gate === 'delivery_readiness' || runtime.active_gate === 'customer_review') {
          currentSkill = 'info';
        }
      }

      targetSkill = currentSkill;
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
    // No active project — natural language triggers ignite directly
    if (naturalMode) {
      targetSkill = 'ignite';
    }
  }

  // Emit skill invocation directive — LLM must invoke the target skill
  const output = createSkillInvocation(targetSkill, context);

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: output,
    },
  }));
}

main();
