import {
  allTriggers,
  FORGE_TRIGGERS,
  BUILD_TRIGGERS as BUILD_TRIGGERS_I18N,
  REPAIR_TRIGGERS as REPAIR_TRIGGERS_I18N,
  EXPRESS_TRIGGERS as EXPRESS_TRIGGERS_I18N,
  RESUME_TRIGGERS,
  STATUS_TRIGGERS,
  ANALYZE_PROJECT_TRIGGERS,
  DESIGN_IMPROVEMENT_TRIGGERS,
  NATURAL_PROJECT_SKILL_TRIGGERS,
} from './forge-i18n.mjs';

const forgeTriggers = allTriggers(FORGE_TRIGGERS);
const buildTriggers = allTriggers(BUILD_TRIGGERS_I18N);
const repairTriggers = allTriggers(REPAIR_TRIGGERS_I18N);
const expressTriggers = allTriggers(EXPRESS_TRIGGERS_I18N);
const resumeTriggers = allTriggers(RESUME_TRIGGERS);
const statusTriggers = allTriggers(STATUS_TRIGGERS);
const analyzeProjectTriggers = allTriggers(ANALYZE_PROJECT_TRIGGERS);
const designImprovementTriggers = allTriggers(DESIGN_IMPROVEMENT_TRIGGERS);
const naturalProjectSkillTriggers = Object.fromEntries(
  Object.entries(NATURAL_PROJECT_SKILL_TRIGGERS).map(([skill, triggerMap]) => [skill, allTriggers(triggerMap)]),
);
const genericForgeRequests = new Set([
  'forge',
  'forge status',
  'forge progress',
  '포지',
  '포지 상태',
  '포지 진행',
]);
const explicitSkillMappings = [
  ['continue', [/\bforge(?::|\s+)continue\b/, /\bforge(?::|\s+)resume\b/, /포지\s*계속/, /포지\s*이어/]],
  ['info', [/\bforge(?::|\s+)info\b/, /\bforge(?::|\s+)details?\b/, /\bforge(?::|\s+)status\b/, /\bforge(?::|\s+)progress\b/, /포지\s*정보/]],
  ['analyze', [/\bforge(?::|\s+)analy[sz]e\b/, /\bforge(?::|\s+)analysis\b/, /포지\s*분석/]],
  ['cancel', [/\bforge(?::|\s+)cancel\b/, /\bforge(?::|\s+)stop\b/, /\bforge(?::|\s+)abort\b/, /포지\s*취소/, /포지\s*중단/]],
  ['design', [/\bforge(?::|\s+)design\b/]],
  ['plans', [/\bforge(?::|\s+)plans\b/, /\bforge(?::|\s+)plan\b/]],
  ['develop', [/\bforge(?::|\s+)develop\b/]],
  ['fix', [/\bforge(?::|\s+)fix\b/]],
  ['qa', [/\bforge(?::|\s+)qa\b/]],
  ['security', [/\bforge(?::|\s+)security\b/]],
  ['deliver', [/\bforge(?::|\s+)deliver\b/, /\bforge(?::|\s+)delivery\b/]],
  ['troubleshoot', [/\bforge(?::|\s+)troubleshoot\b/]],
  ['ignite', [/\bforge:ignite\b/, /\bforge\s+ignite\b/, /포지\s*점화/]],
];
const prioritizedNaturalSkillMatchers = [
  ['analyze', designImprovementTriggers],
  ['analyze', analyzeProjectTriggers],
  ['info', statusTriggers],
  ['continue', resumeTriggers],
  ...Object.entries(naturalProjectSkillTriggers).filter(([skill]) => skill !== 'analyze'),
];

const PHASE_TO_SKILL = {
  plan: 'plans',
  delivery: 'deliver',
  complete: 'info',
};

function matchesAny(patterns, text) {
  return patterns.some(pattern => pattern.test(text));
}

function detectSkillFromMappings(text, mappings) {
  for (const [skill, patterns] of mappings) {
    if (matchesAny(patterns, text)) {
      return skill;
    }
  }

  return null;
}

export function isNaturalForgeRequest(message) {
  if (matchesAny(expressTriggers, message)) return 'express';
  if (matchesAny(buildTriggers, message)) return 'build';
  if (matchesAny(repairTriggers, message)) return 'repair';
  return null;
}

export function detectNaturalProjectSkill(message) {
  return detectSkillFromMappings(String(message || ''), prioritizedNaturalSkillMatchers);
}

export function isDesignImprovementRequest(message = '') {
  return matchesAny(designImprovementTriggers, String(message || ''));
}

export function extractExplicitForgeSkill(message) {
  return detectSkillFromMappings(String(message || '').trim().toLowerCase(), explicitSkillMappings);
}

export function isGenericForgeRequest(message) {
  return genericForgeRequests.has(String(message || '').trim().toLowerCase());
}

export function deriveForgeRequest(message, { projectActive = false } = {}) {
  const explicitSkill = extractExplicitForgeSkill(message);
  const isExplicitForge = matchesAny(forgeTriggers, message);
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
