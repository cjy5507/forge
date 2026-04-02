import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

export const PHASE_SEQUENCE = [
  'intake',
  'discovery',
  'design',
  'develop',
  'qa',
  'security',
  'fix',
  'delivery',
  'complete',
];

export const TIER_SEQUENCE = ['off', 'light', 'medium', 'full'];

const LEGACY_PHASE_MAP = new Map([
  [0, 'intake'],
  [1, 'discovery'],
  [2, 'design'],
  [3, 'develop'],
  [4, 'qa'],
  [4.5, 'security'],
  [5, 'fix'],
  [6, 'delivery'],
  [7, 'complete'],
]);

const DEFAULT_STATS = {
  started_at: '',
  last_prompt_at: '',
  last_finished_at: '',
  session_count: 0,
  agent_calls: 0,
  rollback_count: 0,
  failure_count: 0,
  stop_block_count: 0,
  test_runs: 0,
  test_failures: 0,
};

const DEFAULT_RUNTIME = {
  version: 2,
  active_tier: 'light',
  last_task_type: 'general',
  recommended_agents: [],
  active_agents: {},
  recent_agents: [],
  recent_failures: [],
  stop_guard: {
    block_count: 0,
    last_reason: '',
    last_message: '',
  },
  stats: { ...DEFAULT_STATS },
  last_event: null,
  updated_at: '',
};

function ensureForgeDir(cwd = '.') {
  const forgeDir = `${cwd}/.forge`;
  if (!existsSync(forgeDir)) {
    mkdirSync(forgeDir, { recursive: true });
  }
  return forgeDir;
}

function readJsonFile(path, fallback = null) {
  if (!existsSync(path)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function getStatePath(cwd = '.') {
  return `${cwd}/.forge/state.json`;
}

export function getRuntimePath(cwd = '.') {
  return `${cwd}/.forge/runtime.json`;
}

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

export function normalizePhaseId(value) {
  if (typeof value === 'number') {
    return LEGACY_PHASE_MAP.get(value) || 'intake';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();

    if (PHASE_SEQUENCE.includes(trimmed)) {
      return trimmed;
    }

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return LEGACY_PHASE_MAP.get(numeric) || 'intake';
    }
  }

  return 'intake';
}

export function resolvePhase(state = {}) {
  const phaseSource =
    typeof state.phase === 'number' || typeof state.phase === 'string'
      ? state.phase
      : state.phase_id ?? state.phase_name;
  const phaseId = normalizePhaseId(phaseSource);
  const phaseIndex = PHASE_SEQUENCE.indexOf(phaseId);

  return {
    id: phaseId,
    index: phaseIndex === -1 ? 0 : phaseIndex,
    label: phaseId,
  };
}

function mergeStats(stats = {}) {
  return {
    ...DEFAULT_STATS,
    ...(stats || {}),
  };
}

export function detectTaskType(message = '') {
  const text = String(message).toLowerCase();

  if (!text.trim()) {
    return 'general';
  }

  if (/(bug|fix|regression|오류|버그|고쳐|diagnos|troubleshoot|rca|why)/.test(text)) {
    return 'bugfix';
  }

  if (/(refactor|cleanup|정리|리팩토링|simplify|rename)/.test(text)) {
    return 'refactor';
  }

  if (/(review|리뷰|코드리뷰|pr review|code review)/.test(text)) {
    return 'review';
  }

  if (/(question|explain|what|어떻게|설명|질문)/.test(text)) {
    return 'question';
  }

  if (/(feature|implement|add|build|create|page|screen|기능|추가|구현|만들)/.test(text)) {
    return 'feature';
  }

  if (/(full|all phases|pipeline|entire|whole system|company|workflow|하네스|phase|팀)/.test(text)) {
    return 'pipeline';
  }

  return 'general';
}

export function classifyTierFromMessage(message = '', state = null) {
  const text = String(message).toLowerCase();
  const taskType = detectTaskType(text);

  if (/\bforge:ignite\b|\bset up forge\b|\bbuild a harness\b|전체|all phases|full pipeline|하네스/.test(text)) {
    return 'full';
  }

  if (taskType === 'question' || taskType === 'bugfix') {
    return 'light';
  }

  if (taskType === 'feature' || taskType === 'refactor') {
    return 'medium';
  }

  return inferTierFromState(state);
}

export function inferTierFromState(state = null) {
  if (!state) {
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

export function recommendedAgentsFor({ tier = 'light', taskType = 'general', phaseId = 'develop' } = {}) {
  const normalizedTier = normalizeTier(tier);

  if (normalizedTier === 'light') {
    if (taskType === 'bugfix') {
      return ['developer', 'troubleshooter'];
    }
    if (taskType === 'refactor') {
      return ['developer', 'lead-dev'];
    }
    return ['developer'];
  }

  if (normalizedTier === 'medium') {
    if (taskType === 'feature') {
      return ['cto', 'developer', 'qa'];
    }
    if (taskType === 'refactor') {
      return ['developer', 'lead-dev', 'qa'];
    }
    return ['developer', 'qa'];
  }

  if (phaseId === 'design') {
    return ['ceo', 'cto', 'designer'];
  }

  if (phaseId === 'delivery') {
    return ['ceo', 'tech-writer', 'qa'];
  }

  return ['ceo', 'pm', 'cto', 'lead-dev', 'developer', 'qa', 'security-reviewer', 'tech-writer'];
}

export function compactForgeContext(state, runtime = DEFAULT_RUNTIME) {
  if (!state) {
    return '[Forge] light idle';
  }

  const phase = resolvePhase(state);
  const spec = state.spec_approved ? '✓spec' : '×spec';
  const design = state.design_approved ? '✓design' : '×design';
  const tier = normalizeTier(runtime?.active_tier || state.tier || inferTierFromState(state));
  const agentCount = Array.isArray(runtime?.recommended_agents) ? runtime.recommended_agents.length : 0;

  return `[Forge] ${tier} ${phase.id} ${phase.index}/7 ${spec} ${design}${agentCount ? ` ${agentCount}a` : ''}`;
}

export function summarizePendingWork(state) {
  if (!state) {
    return [];
  }

  const phase = resolvePhase(state);
  const pending = [];

  if (!state.spec_approved && phase.index >= PHASE_SEQUENCE.indexOf('design')) {
    pending.push('spec');
  }

  if (!state.design_approved && phase.index >= PHASE_SEQUENCE.indexOf('develop')) {
    pending.push('design');
  }

  if ((state.holes?.length || 0) > 0 && phase.id !== 'complete') {
    pending.push(`${state.holes.length} holes`);
  }

  if ((state.tasks?.length || 0) > 0 && phase.id === 'develop') {
    pending.push(`${state.tasks.length} tasks`);
  }

  if ((state.pr_queue?.length || 0) > 0) {
    pending.push(`${state.pr_queue.length} prs`);
  }

  if (phase.id !== 'complete' && pending.length === 0) {
    pending.push(phase.id);
  }

  return pending;
}

export function messageLooksInteractive(message = '') {
  const text = String(message).toLowerCase();

  return [
    '?',
    'confirm',
    'approval',
    'approve',
    'choose',
    'which option',
    'waiting for',
    'need your input',
    'do you want',
    '계속할까요',
    '확인',
    '선택',
    '어느',
    '입력이 필요',
  ].some(pattern => text.includes(pattern));
}

export function normalizeStateShape(state = {}) {
  const phase = resolvePhase(state);
  const status = typeof state.status === 'string' ? state.status : 'pending';
  const tier = normalizeTier(state.tier ?? inferTierFromState(state));

  return {
    ...state,
    phase: phase.id === 'security' ? 4.5 : phase.index,
    phase_id: phase.id,
    phase_index: phase.index,
    phase_name: phase.label,
    status,
    tier,
    mode: typeof state.mode === 'string' ? state.mode : 'build',
    agents_active: Array.isArray(state.agents_active) ? state.agents_active : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    holes: Array.isArray(state.holes) ? state.holes : [],
    pr_queue: Array.isArray(state.pr_queue) ? state.pr_queue : [],
    stats: mergeStats(state.stats),
  };
}

export function readForgeState(cwd = '.') {
  const raw = readJsonFile(getStatePath(cwd));
  if (!raw) {
    return null;
  }

  return normalizeStateShape(raw);
}

export function writeForgeState(cwd = '.', state) {
  ensureForgeDir(cwd);
  const normalized = normalizeStateShape(state);
  writeJsonFile(getStatePath(cwd), normalized);
  return normalized;
}

export function readRuntimeState(cwd = '.') {
  const runtime = readJsonFile(getRuntimePath(cwd), DEFAULT_RUNTIME);
  return {
    ...DEFAULT_RUNTIME,
    ...runtime,
    active_tier: normalizeTier(runtime?.active_tier || 'light'),
    recommended_agents: Array.isArray(runtime?.recommended_agents) ? runtime.recommended_agents : [],
    active_agents: runtime?.active_agents || {},
    recent_agents: Array.isArray(runtime?.recent_agents) ? runtime.recent_agents : [],
    recent_failures: Array.isArray(runtime?.recent_failures) ? runtime.recent_failures : [],
    stop_guard: {
      ...DEFAULT_RUNTIME.stop_guard,
      ...(runtime?.stop_guard || {}),
    },
    stats: mergeStats(runtime?.stats),
  };
}

export function writeRuntimeState(cwd = '.', runtime) {
  ensureForgeDir(cwd);
  const next = {
    ...DEFAULT_RUNTIME,
    ...runtime,
    active_tier: normalizeTier(runtime?.active_tier || 'light'),
    recommended_agents: Array.isArray(runtime?.recommended_agents) ? runtime.recommended_agents : [],
    active_agents: runtime?.active_agents || {},
    recent_agents: Array.isArray(runtime?.recent_agents) ? runtime.recent_agents : [],
    recent_failures: Array.isArray(runtime?.recent_failures) ? runtime.recent_failures : [],
    stop_guard: {
      ...DEFAULT_RUNTIME.stop_guard,
      ...(runtime?.stop_guard || {}),
    },
    stats: mergeStats(runtime?.stats),
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(getRuntimePath(cwd), next);
  return next;
}

export function updateRuntimeState(cwd = '.', updater) {
  const current = readRuntimeState(cwd);
  const next = updater(current);
  return writeRuntimeState(cwd, next);
}

export function appendRecent(list, entry, limit = 20) {
  return [entry, ...list].slice(0, limit);
}

export function isProjectActive(state) {
  if (!state) {
    return false;
  }

  if (['complete', 'delivered', 'cancelled', 'canceled'].includes(state.status)) {
    return false;
  }

  return resolvePhase(state).id !== 'complete';
}

export function readActiveTier(cwd = '.', state = null, input = {}) {
  const envTier = process.env.FORGE_TIER;
  if (envTier) {
    return normalizeTier(envTier);
  }

  const runtimePath = getRuntimePath(cwd);
  if (existsSync(runtimePath)) {
    const runtime = readRuntimeState(cwd);
    return normalizeTier(runtime.active_tier);
  }

  if (state?.tier) {
    return normalizeTier(state.tier);
  }

  return classifyTierFromMessage(input?.message || input?.content || '', state);
}

export function updateAdaptiveTier(cwd = '.', { state = null, message = '' } = {}) {
  const inferredTier = classifyTierFromMessage(message, state);
  const taskType = detectTaskType(message);
  const phaseId = state ? resolvePhase(state).id : 'develop';
  const recommendedAgents = recommendedAgentsFor({ tier: inferredTier, taskType, phaseId });

  const runtime = updateRuntimeState(cwd, current => ({
    ...current,
    active_tier: inferredTier,
    last_task_type: taskType,
    recommended_agents: recommendedAgents,
    stats: {
      ...current.stats,
      started_at: current.stats.started_at || new Date().toISOString(),
      last_prompt_at: new Date().toISOString(),
    },
  }));

  return {
    tier: inferredTier,
    taskType,
    recommendedAgents,
    runtime,
  };
}

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

  if (/(package\.json|package-lock\.json|pnpm-lock|yarn\.lock|bun\.lock|deno\.json|requirements\.txt|pyproject\.toml|cargo\.toml)/.test(combined)) {
    return { level: 'high', reason: 'dependency surface changed' };
  }

  if (/(fetch\(|axios|graphql|supabase|stripe|vercel|openai|anthropic|http:\/\/|https:\/\/|process\.env|authorization|bearer )/.test(combined)) {
    return { level: 'high', reason: 'external api or secret-sensitive code' };
  }

  if (/(contracts|code-rules|schema|interface|types?\/)/.test(combined)) {
    return { level: 'medium', reason: 'shared boundary file' };
  }

  if (/(utils?\/|helpers?\/|format|parse|normaliz|refactor)/.test(combined)) {
    return { level: 'low', reason: 'internal utility or repeat pattern' };
  }

  return { level: 'medium', reason: 'feature-level code change' };
}

export function recordStateStats(cwd = '.', updater) {
  const state = readForgeState(cwd);
  if (!state) {
    return null;
  }

  const next = updater(state.stats || mergeStats());
  return writeForgeState(cwd, {
    ...state,
    stats: mergeStats(next),
  });
}
