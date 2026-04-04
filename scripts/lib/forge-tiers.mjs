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

export const TIER_SEQUENCE = ['off', 'light', 'medium', 'full'];

export function normalizeTier(value) {
  if (typeof value !== 'string') {
    return 'light';
  }

  const lowered = value.trim().toLowerCase();
  return TIER_SEQUENCE.includes(lowered) ? lowered : 'light';
}

export function tierAtLeast(currentTier, requiredTier) {
  return TIER_SEQUENCE.indexOf(normalizeTier(currentTier)) >= TIER_SEQUENCE.indexOf(normalizeTier(requiredTier));
}

export function detectTaskType(message = '') {
  const text = String(message).toLowerCase();

  if (!text.trim()) {
    return 'general';
  }

  if (/(\bbug\b|\bfix\b|\bregression\b|오류|버그|고쳐|\bdiagnos\w*\b|\btroubleshoot\b|\brca\b|\bwhy\b)/.test(text)) {
    return 'bugfix';
  }

  if (/(\brefactor\b|\bcleanup\b|정리|리팩토링|\bsimplify\b|\brename\b)/.test(text)) {
    return 'refactor';
  }

  if (/(\breview\b|리뷰|코드리뷰|\bpr review\b|\bcode review\b)/.test(text)) {
    return 'review';
  }

  if (/(\bquestion\b|\bexplain\b|\bwhat\b|어떻게|설명|질문|뭐야|왜)/.test(text)) {
    return 'question';
  }

  if (/(\bfull\b|\ball phases\b|\bpipeline\b|\bentire\b|\bwhole system\b|\bcompany\b|\bworkflow\b|하네스|전체|워크플로우|\bphase\b|팀)/.test(text)) {
    return 'pipeline';
  }

  if (/(\bfeature\b|\bimplement\b|\badd\b|\bbuild\b|\bcreate\b|\bpage\b|\bscreen\b|기능|추가|구현|만들)/.test(text)) {
    return 'feature';
  }

  return 'general';
}

export function classifyTierFromMessage(message = '', state = null) {
  const text = String(message).toLowerCase();
  const taskType = detectTaskType(text);

  if (/\bforge:ignite\b|\bset up forge\b|\bbuild a harness\b|전체|all phases|full pipeline|하네스/.test(text)) {
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
