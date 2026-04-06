#!/usr/bin/env node
// Forge Hook: UserPromptSubmit — detects forge-related messages and updates adaptive tier/runtime

import { existsSync } from 'fs';
import { runHook } from './lib/hook-runner.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { buildStatusModel, renderStatusText } from './lib/forge-status.mjs';
import {
  PHASE_SEQUENCE,
  compactForgeContext,
  getRuntimePath,
  isProjectActive,
  readForgeState,
  readRuntimeState,
  resolvePhase,
  shouldRefreshAnalysis,
  selectResumeSkill,
  updateHudLine,
  updateRuntimeState,
  updateAdaptiveTier,
} from './lib/forge-state.mjs';
import {
  allTriggers,
  FORGE_TRIGGERS,
  BUILD_TRIGGERS as BUILD_TRIGGERS_I18N,
  REPAIR_TRIGGERS as REPAIR_TRIGGERS_I18N,
} from './lib/i18n-patterns.mjs';

const forgeTriggers = allTriggers(FORGE_TRIGGERS);
const buildTriggers = allTriggers(BUILD_TRIGGERS_I18N);
const repairTriggers = allTriggers(REPAIR_TRIGGERS_I18N);

function isNaturalForgeRequest(message) {
  if (buildTriggers.some(re => re.test(message))) return 'build';
  if (repairTriggers.some(re => re.test(message))) return 'repair';
  return null;
}

function createSkillInvocation(skillName, context) {
  return `${context}

[MAGIC KEYWORD: FORGE:${skillName.toUpperCase()}]

You MUST invoke the skill using the Skill tool:
Skill: forge:${skillName}

IMPORTANT: Invoke the skill IMMEDIATELY. Do not summarize, do not ask for confirmation. The Forge pipeline requires autonomous execution.`;
}

function extractExplicitForgeSkill(message) {
  const text = String(message || '').trim().toLowerCase();
  const mappings = [
    { skill: 'continue', patterns: [/\bforge\s+continue\b/, /\bforge\s+resume\b/, /포지\s*계속/, /포지\s*이어/ ] },
    { skill: 'info', patterns: [/\bforge\s+info\b/, /\bforge\s+details?\b/, /포지\s*정보/] },
    { skill: 'analyze', patterns: [/\bforge\s+analy[sz]e\b/, /\bforge\s+analysis\b/, /포지\s*분석/] },
    { skill: 'cancel', patterns: [/\bforge\s+cancel\b/, /\bforge\s+stop\b/, /\bforge\s+abort\b/, /포지\s*취소/, /포지\s*중단/] },
    { skill: 'design', patterns: [/\bforge\s+design\b/] },
    { skill: 'develop', patterns: [/\bforge\s+develop\b/] },
    { skill: 'fix', patterns: [/\bforge\s+fix\b/] },
    { skill: 'qa', patterns: [/\bforge\s+qa\b/] },
    { skill: 'security', patterns: [/\bforge\s+security\b/] },
    { skill: 'deliver', patterns: [/\bforge\s+deliver\b/, /\bforge\s+delivery\b/] },
    { skill: 'ignite', patterns: [/\bforge:ignite\b/, /\bforge\s+ignite\b/, /포지\s*점화/] },
  ];

  for (const mapping of mappings) {
    if (mapping.patterns.some(pattern => pattern.test(text))) {
      return mapping.skill;
    }
  }

  return null;
}

function isGenericForgeRequest(message) {
  const text = String(message || '').trim().toLowerCase();
  return [
    'forge',
    'forge status',
    'forge progress',
    '포지',
    '포지 상태',
    '포지 진행',
  ].includes(text);
}

runHook(async (input) => {
  const cwd = input?.cwd || '.';
  const message = String(input?.message || input?.content || '');
  const lowered = message.toLowerCase();
  const state = readForgeState(cwd);
  const explicitSkill = extractExplicitForgeSkill(message);

  const isExplicitForge = forgeTriggers.some(re => re.test(message));
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

      if (explicitSkill) {
        currentSkill = explicitSkill === 'ignite' && isProjectActive(state) ? 'continue' : explicitSkill;
      } else if (isGenericForgeRequest(message) && isProjectActive(state)) {
        currentSkill = 'continue';
      } else if ((runtime.customer_blockers?.length || 0) > 0 && nextOwner === 'pm') {
        currentSkill = 'continue';
      } else if (typeof runtime.active_gate === 'string' && runtime.active_gate.trim()) {
        if (runtime.active_gate === 'delivery_readiness' || runtime.active_gate === 'customer_review') {
          currentSkill = 'info';
        }
      }

      if (currentSkill === 'continue') {
        const resume = selectResumeSkill(state, runtime);
        if (resume.skill === 'analyze') {
          currentSkill = 'analyze';
          context = `${compactForgeContext(state, adaptive.runtime)} → forge:analyze (${resume.reason}) [${adaptive.recommendedAgents.join(', ')}]`;
        }
      }

      if (['design', 'develop', 'fix'].includes(currentSkill)) {
        const gate = shouldRefreshAnalysis(state, runtime, { phaseOverride: currentSkill });
        if (gate.needed) {
          currentSkill = 'analyze';
          context = `${compactForgeContext(state, adaptive.runtime)} → forge:analyze (${gate.reason}) [${adaptive.recommendedAgents.join(', ')}]`;
        }
      }

      if (currentSkill === 'info') {
        const statusModel = buildStatusModel({ cwd, state, runtime });
        const rendered = renderStatusText(statusModel).trim();
        context = `${rendered}\n\n[Forge] Canonical status surface from scripts/forge-status.mjs`;
      }

      targetSkill = currentSkill;
      const compactOnly = compactForgeContext(state, adaptive.runtime);
      if (!context.includes('→ forge:analyze') && currentSkill !== 'info') {
        context = `${compactOnly} → forge:${currentSkill} [${adaptive.recommendedAgents.join(', ')}]`;
      }
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
    if (explicitSkill) {
      targetSkill = explicitSkill;
    } else if (naturalMode) {
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
}, { name: 'phase-detector' });
