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

const DEFAULT_RUNTIME = {
  version: 1,
  active_agents: {},
  recent_agents: [],
  recent_failures: [],
  stop_guard: {
    block_count: 0,
    last_reason: '',
    last_message: '',
  },
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

export function normalizeStateShape(state = {}) {
  const phase = resolvePhase(state);
  const status = typeof state.status === 'string' ? state.status : 'pending';

  return {
    ...state,
    phase: phase.id === 'security' ? 4.5 : phase.index,
    phase_id: phase.id,
    phase_index: phase.index,
    phase_name: phase.label,
    status,
    agents_active: Array.isArray(state.agents_active) ? state.agents_active : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    holes: Array.isArray(state.holes) ? state.holes : [],
    pr_queue: Array.isArray(state.pr_queue) ? state.pr_queue : [],
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
    active_agents: runtime?.active_agents || {},
    recent_agents: Array.isArray(runtime?.recent_agents) ? runtime.recent_agents : [],
    recent_failures: Array.isArray(runtime?.recent_failures) ? runtime.recent_failures : [],
    stop_guard: {
      ...DEFAULT_RUNTIME.stop_guard,
      ...(runtime?.stop_guard || {}),
    },
  };
}

export function writeRuntimeState(cwd = '.', runtime) {
  ensureForgeDir(cwd);
  const next = {
    ...DEFAULT_RUNTIME,
    ...runtime,
    active_agents: runtime?.active_agents || {},
    recent_agents: Array.isArray(runtime?.recent_agents) ? runtime.recent_agents : [],
    recent_failures: Array.isArray(runtime?.recent_failures) ? runtime.recent_failures : [],
    stop_guard: {
      ...DEFAULT_RUNTIME.stop_guard,
      ...(runtime?.stop_guard || {}),
    },
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

export function summarizePendingWork(state) {
  if (!state) {
    return [];
  }

  const phase = resolvePhase(state);
  const pending = [];

  if (!state.spec_approved && phase.index >= PHASE_SEQUENCE.indexOf('design')) {
    pending.push('spec approval');
  }

  if (!state.design_approved && phase.index >= PHASE_SEQUENCE.indexOf('develop')) {
    pending.push('design approval');
  }

  if ((state.holes?.length || 0) > 0 && phase.id !== 'complete') {
    pending.push(`${state.holes.length} tracked holes`);
  }

  if ((state.tasks?.length || 0) > 0 && phase.id === 'develop') {
    pending.push(`${state.tasks.length} tracked tasks`);
  }

  if ((state.pr_queue?.length || 0) > 0) {
    pending.push(`${state.pr_queue.length} queued PR reviews`);
  }

  if (phase.id !== 'complete' && pending.length === 0) {
    pending.push(`active phase ${phase.id}`);
  }

  return pending;
}

export function messageLooksInteractive(message = '') {
  const text = message.toLowerCase();

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
