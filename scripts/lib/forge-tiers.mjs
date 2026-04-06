import { existsSync } from 'fs';
import {
  DEFAULT_RUNTIME,
  requireString,
  normalizeCompanyMode,
  normalizeDeliveryReadiness,
  normalizeBlockers,
  readJsonFile,
  getRuntimePath,
} from './forge-io.mjs';
import { resolvePhase } from './forge-phases.mjs';
import { TASK_TYPE_PATTERNS, FULL_TIER_PATTERNS, mergeIntoRegex } from './i18n-patterns.mjs';

export const TIER_SEQUENCE = ['off', 'light', 'medium', 'full'];

export function normalizeTier(value) {
  if (typeof value !== 'string') {
    return 'light';
  }

  const lowered = value.trim().toLowerCase();
  return TIER_SEQUENCE.includes(lowered) ? lowered : 'light';
}

export function readEnvTier() {
  const raw = process.env.FORGE_TIER;
  if (typeof raw !== 'string' || !raw.trim()) {
    return '';
  }
  return normalizeTier(raw);
}

export function tierAtLeast(currentTier, requiredTier) {
  return TIER_SEQUENCE.indexOf(normalizeTier(currentTier)) >= TIER_SEQUENCE.indexOf(normalizeTier(requiredTier));
}

// Combined i18n-aware regexes for task type detection (built once at module load)
const BUGFIX_RE = mergeIntoRegex(TASK_TYPE_PATTERNS.bugfix.en, { ko: TASK_TYPE_PATTERNS.bugfix.ko, ja: TASK_TYPE_PATTERNS.bugfix.ja, zh: TASK_TYPE_PATTERNS.bugfix.zh });
const REFACTOR_RE = mergeIntoRegex(TASK_TYPE_PATTERNS.refactor.en, { ko: TASK_TYPE_PATTERNS.refactor.ko, ja: TASK_TYPE_PATTERNS.refactor.ja, zh: TASK_TYPE_PATTERNS.refactor.zh });
const REVIEW_RE = mergeIntoRegex(TASK_TYPE_PATTERNS.review.en, { ko: TASK_TYPE_PATTERNS.review.ko, ja: TASK_TYPE_PATTERNS.review.ja, zh: TASK_TYPE_PATTERNS.review.zh });
const QUESTION_RE = mergeIntoRegex(TASK_TYPE_PATTERNS.question.en, { ko: TASK_TYPE_PATTERNS.question.ko, ja: TASK_TYPE_PATTERNS.question.ja, zh: TASK_TYPE_PATTERNS.question.zh });
const PIPELINE_RE = mergeIntoRegex(TASK_TYPE_PATTERNS.pipeline.en, { ko: TASK_TYPE_PATTERNS.pipeline.ko, ja: TASK_TYPE_PATTERNS.pipeline.ja, zh: TASK_TYPE_PATTERNS.pipeline.zh });
const FEATURE_RE = mergeIntoRegex(TASK_TYPE_PATTERNS.feature.en, { ko: TASK_TYPE_PATTERNS.feature.ko, ja: TASK_TYPE_PATTERNS.feature.ja, zh: TASK_TYPE_PATTERNS.feature.zh });
const FULL_TIER_RE = mergeIntoRegex(FULL_TIER_PATTERNS.en, { ko: FULL_TIER_PATTERNS.ko, ja: FULL_TIER_PATTERNS.ja, zh: FULL_TIER_PATTERNS.zh });

export function detectTaskType(message = '') {
  const text = String(message).toLowerCase();

  if (!text.trim()) {
    return 'general';
  }

  if (BUGFIX_RE.test(text)) return 'bugfix';
  if (REFACTOR_RE.test(text)) return 'refactor';
  if (REVIEW_RE.test(text)) return 'review';
  if (QUESTION_RE.test(text)) return 'question';
  if (PIPELINE_RE.test(text)) return 'pipeline';
  if (FEATURE_RE.test(text)) return 'feature';

  return 'general';
}

export function classifyTierFromMessage(message = '', state = null) {
  const text = String(message).toLowerCase();
  const taskType = detectTaskType(text);

  if (FULL_TIER_RE.test(text)) {
    return 'full';
  }

  if (taskType === 'pipeline') {
    return 'full';
  }

  if (taskType === 'question' || taskType === 'bugfix') {
    return 'light';
  }

  if (taskType === 'review') {
    const phaseTier = inferTierFromState(state);
    return phaseTier === 'full' ? 'medium' : 'light';
  }

  if (taskType === 'feature' || taskType === 'refactor') {
    return 'medium';
  }

  return inferTierFromState(state);
}

export function inferTierFromState(state = null) {
  if (!state || Object.keys(state).length === 0) {
    return 'light';
  }

  if (state.tier) {
    return normalizeTier(state.tier);
  }

  const phase = resolvePhase(state);
  const taskCount = state.tasks?.length || 0;
  const queueCount = state.pr_queue?.length || 0;
  const holeCount = state.holes?.length || 0;
  const lanes = state.lanes || {};
  const laneCount = Object.keys(lanes).length;
  const allLanesDone = laneCount > 0 && Object.values(lanes).every(l =>
    ['done', 'merged'].includes(String(l?.status || '').toLowerCase())
  );

  // De-escalation: delivery/complete with no holes and all lanes done → light
  if (['delivery', 'complete'].includes(phase.id) && holeCount === 0 && allLanesDone) {
    return 'light';
  }

  // De-escalation: fix phase with no holes → light
  if (phase.id === 'fix' && holeCount === 0) {
    return 'light';
  }

  if (['intake', 'discovery', 'design', 'delivery'].includes(phase.id)) {
    return 'full';
  }

  if (phase.id === 'develop') {
    return taskCount >= 6 || queueCount >= 4 ? 'full' : 'medium';
  }

  if (phase.id === 'fix') {
    return holeCount <= 2 ? 'light' : 'medium';
  }

  if (['qa', 'security'].includes(phase.id)) {
    return 'medium';
  }

  return 'light';
}

/**
 * Suggest tier de-escalation based on current state.
 * Returns the current tier if no de-escalation is warranted, or a lower tier if conditions are met.
 */
export function suggestTierDeescalation(state = null) {
  if (!state) return null;
  const currentTier = normalizeTier(state.tier);
  const phase = resolvePhase(state);
  const holeCount = state.holes?.length || 0;
  const taskCount = state.tasks?.length || 0;
  const lanes = state.lanes || {};
  const allLanesDone = Object.values(lanes).every(l =>
    ['done', 'merged'].includes(String(l?.status || '').toLowerCase())
  );

  // De-escalation conditions
  if (currentTier === 'full') {
    if (phase.id === 'delivery' && holeCount === 0 && allLanesDone) return 'light';
    if (phase.id === 'complete') return 'light';
    if (holeCount === 0 && taskCount < 3) return 'medium';
  }
  if (currentTier === 'medium') {
    if (['delivery', 'complete'].includes(phase.id) && holeCount === 0) return 'light';
  }

  return currentTier; // no change
}

function uniqueAgents(agents = []) {
  return [...new Set(agents.filter(Boolean))];
}

// --- Hybrid agent architecture ---
// Agents that can run as prompt switches in the main conversation (no isolation needed).
const LAYER0_PROMPT_AGENTS = new Set(['ceo', 'pm', 'cto', 'designer', 'lead-dev', 'tech-writer']);
// Agents that benefit from peer collaboration via Team pattern.
const LAYER1_TEAM_GROUPS = {
  design: ['cto', 'designer'],
  review: ['lead-dev', 'qa'],
  delivery: ['ceo', 'tech-writer'],
};
// Agents that require process isolation (subagent pattern).
const LAYER2_SUBAGENT_AGENTS = new Set(['developer', 'qa', 'fact-checker', 'security-reviewer', 'troubleshooter', 'analyst']);

/**
 * Structured agent recommendation that extends Array for backward compatibility.
 * Existing code using .length, .join(), iteration, and Array.isArray() continues to work.
 * New code can access .layer0_prompt, .layer1_team, .layer2_subagent, and .tools.
 */
class AgentRecommendation extends Array {
  // Prevent Array methods (.slice, .filter, .map) from calling this constructor
  // with a single number argument (length), which would fail the spread.
  static get [Symbol.species]() {
    return Array;
  }

  constructor(agents, { layer0_prompt = [], layer1_team = [], layer2_subagent = [], tools = [] } = {}) {
    super(...(Array.isArray(agents) ? agents : []));
    Object.defineProperty(this, 'layer0_prompt', { value: layer0_prompt, enumerable: false });
    Object.defineProperty(this, 'layer1_team', { value: layer1_team, enumerable: false });
    Object.defineProperty(this, 'layer2_subagent', { value: layer2_subagent, enumerable: false });
    Object.defineProperty(this, 'tools', { value: tools, enumerable: false });
  }

  /** Serialize to plain array for JSON persistence (runtime state). */
  toJSON() {
    return [...this];
  }
}

function classifyAgents(agents) {
  const layer0 = [];
  const layer1 = [];
  const layer2 = [];
  const tools = [];

  for (const agent of agents) {
    if (LAYER2_SUBAGENT_AGENTS.has(agent)) {
      layer2.push(agent);
    } else if (LAYER0_PROMPT_AGENTS.has(agent)) {
      layer0.push(agent);
    } else {
      layer2.push(agent); // unknown agents default to isolated subagent
    }
  }

  // Detect team collaboration opportunities
  for (const [, group] of Object.entries(LAYER1_TEAM_GROUPS)) {
    if (group.every(a => layer0.includes(a))) {
      for (const a of group) {
        if (!layer1.includes(a)) layer1.push(a);
      }
    }
  }

  // Add codebase-memory-mcp tools when researcher or analyst is present
  if (agents.includes('researcher') || agents.includes('analyst')) {
    tools.push('codebase-memory-mcp');
  }

  return new AgentRecommendation(agents, {
    layer0_prompt: layer0,
    layer1_team: layer1,
    layer2_subagent: layer2,
    tools,
  });
}

function recommendedAgentsForCompanyRuntime(runtime = {}, fallback = []) {
  const companyMode = normalizeCompanyMode(runtime?.company_mode);
  if (companyMode !== 'autonomous_company') {
    return classifyAgents(fallback);
  }

  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const activeGate = requireString(runtime?.active_gate);
  const activeGateOwner = requireString(runtime?.active_gate_owner);
  const readiness = normalizeDeliveryReadiness(runtime?.delivery_readiness);
  const nextSessionOwner = requireString(runtime?.next_session_owner);

  if (nextSessionOwner) {
    return classifyAgents(uniqueAgents([nextSessionOwner, activeGateOwner, ...fallback]));
  }

  if (customerBlockers.length > 0) {
    return classifyAgents(uniqueAgents(['ceo', 'pm', activeGateOwner, ...fallback]));
  }

  if (activeGate === 'design_readiness') {
    return classifyAgents(uniqueAgents(['cto', 'designer', 'researcher', activeGateOwner, ...fallback]));
  }

  if (activeGate === 'implementation_readiness') {
    return classifyAgents(uniqueAgents(['lead-dev', 'developer', 'qa', activeGateOwner, ...fallback]));
  }

  if (activeGate === 'qa') {
    return classifyAgents(uniqueAgents(['qa', 'developer', 'lead-dev', activeGateOwner, ...fallback]));
  }

  if (activeGate === 'security') {
    return classifyAgents(uniqueAgents(['security-reviewer', 'developer', 'lead-dev', activeGateOwner, ...fallback]));
  }

  if (activeGate === 'delivery_readiness') {
    if (readiness === 'blocked' || internalBlockers.length > 0) {
      return classifyAgents(uniqueAgents(['qa', 'security-reviewer', 'ceo', activeGateOwner, ...fallback]));
    }
    return classifyAgents(uniqueAgents(['ceo', 'tech-writer', 'qa', activeGateOwner, ...fallback]));
  }

  if (activeGate === 'customer_review') {
    return classifyAgents(uniqueAgents(['ceo', 'tech-writer', activeGateOwner, ...fallback]));
  }

  return activeGateOwner ? classifyAgents(uniqueAgents([activeGateOwner, ...fallback])) : classifyAgents(fallback);
}

export function recommendedAgentsFor({ tier = 'light', taskType = 'general', phaseId = 'develop', runtime = null } = {}) {
  const normalizedTier = normalizeTier(tier);

  if (normalizedTier === 'off') {
    return classifyAgents([]);
  }

  if (normalizedTier === 'light') {
    if (taskType === 'bugfix') {
      return classifyAgents(['developer', 'troubleshooter']);
    }
    if (taskType === 'refactor') {
      return classifyAgents(['developer', 'lead-dev']);
    }
    return recommendedAgentsForCompanyRuntime(runtime, ['developer']);
  }

  if (normalizedTier === 'medium') {
    if (taskType === 'feature') {
      return recommendedAgentsForCompanyRuntime(runtime, ['cto', 'developer', 'qa']);
    }
    if (taskType === 'refactor') {
      return recommendedAgentsForCompanyRuntime(runtime, ['developer', 'lead-dev', 'qa']);
    }
    return recommendedAgentsForCompanyRuntime(runtime, ['developer', 'qa']);
  }

  if (phaseId === 'discovery') {
    return recommendedAgentsForCompanyRuntime(runtime, ['ceo', 'pm', 'researcher']);
  }

  if (phaseId === 'design') {
    return recommendedAgentsForCompanyRuntime(runtime, ['ceo', 'cto', 'designer', 'researcher', 'analyst']);
  }

  if (phaseId === 'isolate' || phaseId === 'reproduce') {
    return recommendedAgentsForCompanyRuntime(runtime, ['troubleshooter', 'analyst', 'developer']);
  }

  if (phaseId === 'delivery') {
    return recommendedAgentsForCompanyRuntime(runtime, ['ceo', 'tech-writer', 'qa']);
  }

  return recommendedAgentsForCompanyRuntime(runtime, ['ceo', 'pm', 'cto', 'lead-dev', 'developer', 'qa', 'security-reviewer', 'tech-writer']);
}

export function readActiveTier(cwd = '.', state = null, input = {}) {
  const envTier = process.env.FORGE_TIER;
  if (envTier) {
    return normalizeTier(envTier);
  }

  const runtimePath = getRuntimePath(cwd);
  if (existsSync(runtimePath)) {
    const raw = readJsonFile(runtimePath, DEFAULT_RUNTIME);
    return normalizeTier(raw.active_tier);
  }

  if (state?.tier) {
    return normalizeTier(state.tier);
  }

  return classifyTierFromMessage(input?.message || input?.content || '', state);
}

/** Ordered risk classification rules — first match wins. */
const WRITE_RISK_RULES = [
  { level: 'high',   reason: 'dependency surface changed',          pattern: /(package\.json|package-lock\.json|pnpm-lock|yarn\.lock|bun\.lock|deno\.json|requirements\.txt|pyproject\.toml|cargo\.toml)/ },
  { level: 'high',   reason: 'external api or secret-sensitive code', pattern: /(\bfetch\s*\(|\baxios\b|\bgraphql\b|\bsupabase\b|\bstripe\b(?!pattern|element|style)|\bvercel\b|\bopenai\b|\banthropic\b|\bprocess\.env\b|\bauthorization\b|\bbearer\s)/ },
  { level: 'medium', reason: 'shared boundary file',                pattern: /(contracts|code-rules|schema|interface|types?\/)/ },
  { level: 'low',    reason: 'internal utility or repeat pattern',  pattern: /(utils?\/|helpers?\/|format|parse|normaliz|refactor)/ },
];

export function detectWriteRisk(input = {}) {
  const toolInput = input?.tool_input || input || {};
  const filePath = String(
    toolInput.file_path ||
      toolInput.path ||
      toolInput.target_file ||
      toolInput.file ||
      '',
  );
  const content = String(
    toolInput.content ||
      toolInput.new_string ||
      toolInput.old_string ||
      toolInput.insert_text ||
      '',
  ).toLowerCase();

  const combined = `${filePath.toLowerCase()}\n${content}`;

  if (!combined.trim()) {
    return { level: 'medium', reason: 'unknown write target' };
  }

  for (const rule of WRITE_RISK_RULES) {
    if (rule.pattern.test(combined)) {
      return { level: rule.level, reason: rule.reason };
    }
  }

  return { level: 'medium', reason: 'feature-level code change' };
}
