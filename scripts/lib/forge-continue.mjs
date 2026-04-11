import { buildStatusModel, renderStatusText } from './forge-status.mjs';
import { normalizeRuntimeState, selectResumeSkill } from './forge-session.mjs';
import { compactForgeContext } from './forge-compact-context.mjs';
import { describeCrossHostResume } from './forge-host.mjs';
import { formatBehavioralContext } from './forge-behavioral-audit.mjs';

export function createSkillDirective(skillName, context, { reason = '', warm = false } = {}) {
  const warmNote = warm
    ? '\nResume from the saved handoff first, then continue the current phase from that context.'
    : '';
  const resumeReason = reason ? `\nReason: ${reason}` : '';

  return `${context}

[MAGIC KEYWORD: FORGE:${skillName.toUpperCase()}]

CRITICAL BLOCKING REQUIREMENT — You MUST call the Skill tool BEFORE any other tool call or text output:
  Skill("forge:${skillName}")

Do NOT use Agent, Explore, Read, Bash, Grep, or any other tool first.
Do NOT output any text before invoking the skill.
The Skill tool loads the full execution protocol. All exploration, planning, and coding happens INSIDE the skill.
${skillName === 'continue' ? 'Resume the Forge pipeline immediately.' : 'Start the Forge pipeline immediately.'}${warmNote}${resumeReason}`;
}

export function selectContinueDirective({
  cwd = '.',
  state,
  runtime,
} = {}) {
  const normalizedRuntime = normalizeRuntimeState(runtime, { state });
  const resume = selectResumeSkill(state, normalizedRuntime);
  const skill = resume.skill || 'continue';

  return {
    cwd,
    state,
    runtime: normalizedRuntime,
    skill,
    reason: resume.reason || '',
  };
}

export function buildContinueContext({
  cwd = '.',
  state,
  runtime,
  skill = 'continue',
  context = '',
} = {}) {
  const normalizedRuntime = normalizeRuntimeState(runtime, { state });

  let baseContext = context || normalizedRuntime.last_compact_context || compactForgeContext(state, normalizedRuntime);
  if (skill === 'info') {
    baseContext = `${renderStatusText(buildStatusModel({
      cwd,
      state,
      runtime: normalizedRuntime,
    })).trim()}

[Forge] Canonical status surface from scripts/forge-status.mjs`;
  }

  const hostBridge = describeCrossHostResume(normalizedRuntime);
  if (hostBridge) {
    baseContext = `${baseContext}\n\n[Forge] ${hostBridge}`;
  }

  const behavioralContext = formatBehavioralContext(
    normalizedRuntime,
    normalizedRuntime.preferred_locale || normalizedRuntime.detected_locale || 'en',
  );
  if (behavioralContext) {
    baseContext = `${baseContext}\n\n${behavioralContext}`;
  }

  return baseContext;
}

export function renderContinueDirective({
  skill = 'continue',
  reason = '',
  context = '',
  staleTier = 'fresh',
} = {}) {
  return createSkillDirective(skill, context, {
    reason,
    warm: staleTier === 'warm',
  });
}

export function buildContinueDirective({
  cwd = '.',
  state,
  runtime,
  staleTier = 'fresh',
  context = '',
} = {}) {
  const selected = selectContinueDirective({
    cwd,
    state,
    runtime,
  });
  const baseContext = buildContinueContext({
    cwd: selected.cwd,
    state: selected.state,
    runtime: selected.runtime,
    skill: selected.skill,
    context,
  });

  return {
    skill: selected.skill,
    reason: selected.reason,
    additionalContext: renderContinueDirective({
      skill: selected.skill,
      reason: selected.reason,
      context: baseContext,
      staleTier,
    }),
  };
}
