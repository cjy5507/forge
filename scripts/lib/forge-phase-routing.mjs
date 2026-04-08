import {
  allTriggers,
  FORGE_TRIGGERS,
  BUILD_TRIGGERS as BUILD_TRIGGERS_I18N,
  REPAIR_TRIGGERS as REPAIR_TRIGGERS_I18N,
  EXPRESS_TRIGGERS as EXPRESS_TRIGGERS_I18N,
  RESUME_TRIGGERS,
  STATUS_TRIGGERS,
  ANALYZE_PROJECT_TRIGGERS,
} from './i18n-patterns.mjs';

const forgeTriggers = allTriggers(FORGE_TRIGGERS);
const buildTriggers = allTriggers(BUILD_TRIGGERS_I18N);
const repairTriggers = allTriggers(REPAIR_TRIGGERS_I18N);
const expressTriggers = allTriggers(EXPRESS_TRIGGERS_I18N);
const resumeTriggers = allTriggers(RESUME_TRIGGERS);
const statusTriggers = allTriggers(STATUS_TRIGGERS);
const analyzeProjectTriggers = allTriggers(ANALYZE_PROJECT_TRIGGERS);

const PHASE_TO_SKILL = {
  plan: 'plans',
  delivery: 'deliver',
  complete: 'info',
};

export function isNaturalForgeRequest(message) {
  if (expressTriggers.some(re => re.test(message))) return 'express';
  if (buildTriggers.some(re => re.test(message))) return 'build';
  if (repairTriggers.some(re => re.test(message))) return 'repair';
  return null;
}

export function detectNaturalProjectSkill(message) {
  const text = String(message || '');
  if (analyzeProjectTriggers.some(re => re.test(text))) return 'analyze';
  if (statusTriggers.some(re => re.test(text))) return 'info';
  if (resumeTriggers.some(re => re.test(text))) return 'continue';
  return null;
}

export function extractExplicitForgeSkill(message) {
  const text = String(message || '').trim().toLowerCase();
  const mappings = [
    { skill: 'continue', patterns: [/\bforge\s+continue\b/, /\bforge\s+resume\b/, /포지\s*계속/, /포지\s*이어/] },
    { skill: 'info', patterns: [/\bforge\s+info\b/, /\bforge\s+details?\b/, /포지\s*정보/] },
    { skill: 'analyze', patterns: [/\bforge\s+analy[sz]e\b/, /\bforge\s+analysis\b/, /포지\s*분석/] },
    { skill: 'cancel', patterns: [/\bforge\s+cancel\b/, /\bforge\s+stop\b/, /\bforge\s+abort\b/, /포지\s*취소/, /포지\s*중단/] },
    { skill: 'design', patterns: [/\bforge\s+design\b/] },
    { skill: 'plans', patterns: [/\bforge\s+plans\b/, /\bforge\s+plan\b/] },
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

export function isGenericForgeRequest(message) {
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

export function deriveForgeRequest(message, { projectActive = false } = {}) {
  const explicitSkill = extractExplicitForgeSkill(message);
  const isExplicitForge = forgeTriggers.some(re => re.test(message));
  const naturalMode = !projectActive ? isNaturalForgeRequest(message) : null;
  const naturalSkill = !isExplicitForge && projectActive ? detectNaturalProjectSkill(message) : null;

  return {
    explicitSkill,
    isExplicitForge,
    naturalMode,
    naturalSkill,
    isForgeRequest: isExplicitForge || naturalMode !== null || naturalSkill !== null,
  };
}

export function resolveTargetSkill({
  explicitSkill = null,
  naturalMode = null,
  naturalSkill = null,
  projectActive = false,
  phaseId = '',
  runtime = {},
  message = '',
} = {}) {
  let currentSkill = PHASE_TO_SKILL[phaseId] || phaseId || 'ignite';
  const nextOwner = typeof runtime.next_session_owner === 'string' ? runtime.next_session_owner.trim() : '';
  const genericForgeRequest = isGenericForgeRequest(message);
  const resumeSurfaceRequested = (
    explicitSkill === 'continue'
    || naturalSkill === 'continue'
    || (explicitSkill === 'ignite' && projectActive)
    || (genericForgeRequest && projectActive)
    || (!explicitSkill && (runtime.customer_blockers?.length || 0) > 0 && nextOwner === 'pm')
  );

  if (explicitSkill) {
    currentSkill = explicitSkill === 'ignite' && projectActive ? 'continue' : explicitSkill;
  } else if (naturalSkill) {
    currentSkill = naturalSkill;
  } else if (genericForgeRequest && projectActive) {
    currentSkill = 'continue';
  } else if ((runtime.customer_blockers?.length || 0) > 0 && nextOwner === 'pm') {
    currentSkill = 'continue';
  } else if (typeof runtime.active_gate === 'string' && runtime.active_gate.trim()) {
    if (runtime.active_gate === 'delivery_readiness' || runtime.active_gate === 'customer_review') {
      currentSkill = 'info';
    }
  } else if (!projectActive && naturalMode) {
    currentSkill = 'ignite';
  }

  return {
    currentSkill,
    resumeSurfaceRequested,
  };
}
