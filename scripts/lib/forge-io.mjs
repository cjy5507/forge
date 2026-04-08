import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { withRetry, LockError } from './error-handler.mjs';

const activeLocks = new Set();
const LOCK_STALE_MS = 5000;
const LOCK_FUTURE_SKEW_MS = 1000;
let activeJsonReadCache = null;
const jsonReadCacheStats = {
  hits: 0,
  misses: 0,
};

function parseLockTimestamp(lockContent) {
  const parts = String(lockContent || '').trim().split('.');
  if (parts.length < 2) {
    return NaN;
  }
  return parseInt(parts[1], 10);
}

function cleanupStaleLock(lockPath) {
  try {
    const lockContent = readFileSync(lockPath, 'utf8');
    const lockTimestamp = parseLockTimestamp(lockContent);
    if (
      !Number.isFinite(lockTimestamp)
      || lockTimestamp > Date.now() + LOCK_FUTURE_SKEW_MS
      || Date.now() - lockTimestamp > LOCK_STALE_MS
    ) {
      try { unlinkSync(lockPath); } catch {}
    }
  } catch {}
}

export function withForgeLock(cwd, callback) {
  const lockPath = join(resolveForgeBaseDir(cwd), '.forge', 'forge.lock');

  if (activeLocks.has(lockPath)) {
    return callback();
  }

  const maxRetries = 5;
  const retryDelay = 50;

  const forgeDir = join(resolveForgeBaseDir(cwd), '.forge');
  if (!existsSync(forgeDir)) {
    mkdirSync(forgeDir, { recursive: true });
  }

  return withRetry(() => {
    writeFileSync(lockPath, `${process.pid}.${Date.now()}`, { flag: 'wx' });
    activeLocks.add(lockPath);
    try {
      return callback();
    } finally {
      activeLocks.delete(lockPath);
      try { unlinkSync(lockPath); } catch {}
    }
  }, {
    maxRetries,
    retryDelay,
    shouldRetry: err => err?.code === 'EEXIST',
    onRetry: () => cleanupStaleLock(lockPath),
    onExhausted: (_err, retries) => {
      const error = new LockError(`Forge runtime lock acquisition failed after ${retries} retries: ${lockPath}`);
      error.code = 'ELOCKED';
      return error;
    },
  });
}

export const DEFAULT_STATS = {
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

export const DEFAULT_ANALYSIS = {
  last_type: '',
  last_target: '',
  artifact_path: '',
  graph_health: 'unknown',
  confidence: 'unknown',
  risk_level: 'unknown',
  summary: '',
  updated_at: '',
  stale: false,
};

export const DEFAULT_NEXT_ACTION = {
  kind: '',
  skill: '',
  target: '',
  reason: '',
  summary: '',
  updated_at: '',
};

export const DEFAULT_HOST_CONTEXT = {
  current_host: '',
  previous_host: '',
  last_event_host: '',
  last_event_name: '',
  last_resume_host: '',
  last_resume_at: '',
};

export const DEFAULT_RUNTIME = {
  version: 3,
  active_tier: 'light',
  detected_locale: 'en',
  last_task_type: 'general',
  task_graph_version: 1,
  company_mode: 'guided',
  company_gate_mode: 'auto',
  company_phase_anchor: '',
  active_gate: '',
  active_gate_owner: '',
  delivery_readiness: 'unknown',
  customer_blockers: [],
  internal_blockers: [],
  current_session_goal: '',
  session_exit_criteria: [],
  next_session_goal: '',
  next_session_owner: '',
  session_handoff_summary: '',
  session_brief_mode: 'auto',
  session_phase_anchor: '',
  session_gate_anchor: '',
  session_customer_blocker_count: 0,
  session_internal_blocker_count: 0,
  recommended_agents: [],
  lanes: {},
  active_worktrees: {},
  next_lane: '',
  active_agents: {},
  recent_agents: [],
  recent_failures: [],
  analysis: { ...DEFAULT_ANALYSIS },
  next_action: { ...DEFAULT_NEXT_ACTION },
  host_context: { ...DEFAULT_HOST_CONTEXT },
  stop_guard: {
    block_count: 0,
    last_reason: '',
    last_message: '',
  },
  stats: { ...DEFAULT_STATS },
  last_event: null,
  updated_at: '',
};

/** Safely extract a trimmed string, returning fallback for non-string values. */
export function requireString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function ensureForgeDir(cwd = '.') {
  const forgeDir = join(resolveForgeBaseDir(cwd), '.forge');
  if (!existsSync(forgeDir)) {
    mkdirSync(forgeDir, { recursive: true });
  }
  return forgeDir;
}

export function resolveForgeBaseDir(cwd = '.') {
  const start = resolve(cwd);
  let current = start;

  while (true) {
    if (existsSync(join(current, '.forge'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

function cloneJsonValue(value) {
  return value == null ? value : structuredClone(value);
}

function buildJsonReadCacheKey(path) {
  return resolve(path);
}

function materializeJsonRead(entry, fallback, { logErrors = true } = {}) {
  if (entry?.error && logErrors && !entry.errorLogged) {
    process.stderr.write(`[Forge] warning: failed to parse ${entry.path}: ${entry.error.message}\n`);
    entry.errorLogged = true;
  }

  return {
    exists: Boolean(entry?.exists),
    value: !entry?.exists || entry?.error ? fallback : cloneJsonValue(entry?.value),
    error: entry?.error || null,
  };
}

function readJsonFileDetailedUncached(path) {
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      value: null,
      error: null,
      errorLogged: false,
    };
  }

  try {
    return {
      path,
      exists: true,
      value: JSON.parse(readFileSync(path, 'utf8')),
      error: null,
      errorLogged: false,
    };
  } catch (error) {
    return {
      path,
      exists: true,
      value: null,
      error,
      errorLogged: false,
    };
  }
}

export function withJsonReadCache(callback) {
  if (activeJsonReadCache) {
    return callback();
  }

  activeJsonReadCache = new Map();
  try {
    const result = callback();
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        activeJsonReadCache = null;
      });
    }
    activeJsonReadCache = null;
    return result;
  } catch (error) {
    activeJsonReadCache = null;
    throw error;
  }
}

export function getJsonReadCacheStats() {
  return {
    active: Boolean(activeJsonReadCache),
    entries: activeJsonReadCache?.size || 0,
    hits: jsonReadCacheStats.hits,
    misses: jsonReadCacheStats.misses,
  };
}

export function resetJsonReadCacheStats() {
  jsonReadCacheStats.hits = 0;
  jsonReadCacheStats.misses = 0;
}

export function readJsonFileDetailed(path, fallback = null, { logErrors = true } = {}) {
  if (activeJsonReadCache) {
    const cacheKey = buildJsonReadCacheKey(path);
    if (activeJsonReadCache.has(cacheKey)) {
      jsonReadCacheStats.hits += 1;
      return materializeJsonRead(activeJsonReadCache.get(cacheKey), fallback, { logErrors });
    }

    jsonReadCacheStats.misses += 1;
    const entry = readJsonFileDetailedUncached(path);
    activeJsonReadCache.set(cacheKey, entry);
    return materializeJsonRead(entry, fallback, { logErrors });
  }

  const entry = readJsonFileDetailedUncached(path);
  return materializeJsonRead(entry, fallback, { logErrors });
}

export function readJsonFile(path, fallback = null) {
  return readJsonFileDetailed(path, fallback).value;
}

export function writeJsonFile(path, value) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);

  if (activeJsonReadCache) {
    activeJsonReadCache.set(buildJsonReadCacheKey(path), {
      path,
      exists: true,
      value: cloneJsonValue(value),
      error: null,
      errorLogged: false,
    });
  }
}

export function getStatePath(cwd = '.') {
  return join(resolveForgeBaseDir(cwd), '.forge', 'state.json');
}

export function getRuntimePath(cwd = '.') {
  return join(resolveForgeBaseDir(cwd), '.forge', 'runtime.json');
}

export function mergeStats(stats = {}) {
  const merged = { ...DEFAULT_STATS, ...(stats || {}) };
  for (const key of Object.keys(DEFAULT_STATS)) {
    if (typeof DEFAULT_STATS[key] === 'number' && typeof merged[key] !== 'number') {
      merged[key] = Number(merged[key]) || 0;
    }
  }
  return merged;
}

export function normalizeCompanyMode(value) {
  if (typeof value !== 'string') {
    return 'guided';
  }

  const lowered = value.trim().toLowerCase();
  return lowered === 'autonomous_company' ? lowered : 'guided';
}

export function normalizeDeliveryReadiness(value) {
  if (typeof value !== 'string') {
    return 'unknown';
  }

  const lowered = value.trim().toLowerCase();
  return ['unknown', 'blocked', 'in_progress', 'ready_for_review', 'delivered', 'completed', 'cancelled'].includes(lowered)
    ? lowered
    : 'unknown';
}

export function normalizeBlockers(blockers = []) {
  if (!Array.isArray(blockers)) {
    return [];
  }

  return blockers
    .map((blocker) => {
      if (typeof blocker === 'string') {
        return {
          summary: blocker,
          owner: '',
          severity: 'blocker',
        };
      }

      if (!blocker || typeof blocker !== 'object') {
        return null;
      }

      return {
        ...blocker,
        summary: typeof blocker.summary === 'string' ? blocker.summary : '',
        owner: typeof blocker.owner === 'string' ? blocker.owner : '',
        severity: typeof blocker.severity === 'string' ? blocker.severity : 'blocker',
      };
    })
    .filter(Boolean)
    .filter(blocker => blocker.summary);
}

export function normalizeStringList(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

export function normalizeAnalysisMeta(analysis = {}) {
  const normalized = {
    ...DEFAULT_ANALYSIS,
    ...(analysis && typeof analysis === 'object' ? analysis : {}),
  };

  normalized.last_type = requireString(normalized.last_type);
  normalized.last_target = requireString(normalized.last_target);
  normalized.artifact_path = requireString(normalized.artifact_path);
  normalized.graph_health = requireString(normalized.graph_health, 'unknown') || 'unknown';
  normalized.confidence = requireString(normalized.confidence, 'unknown') || 'unknown';
  normalized.risk_level = requireString(normalized.risk_level, 'unknown') || 'unknown';
  normalized.summary = requireString(normalized.summary);
  normalized.updated_at = requireString(normalized.updated_at);
  normalized.stale = Boolean(normalized.stale);

  return normalized;
}

export function normalizeHostId(value, fallback = '') {
  const normalized = requireString(value, fallback).toLowerCase();
  if (['claude', 'codex', 'gemini', 'qwen', 'unknown'].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

export function normalizeHostContext(hostContext = {}) {
  const normalized = {
    ...DEFAULT_HOST_CONTEXT,
    ...(hostContext && typeof hostContext === 'object' ? hostContext : {}),
  };

  normalized.current_host = normalizeHostId(normalized.current_host);
  normalized.previous_host = normalizeHostId(normalized.previous_host);
  normalized.last_event_host = normalizeHostId(normalized.last_event_host);
  normalized.last_event_name = requireString(normalized.last_event_name);
  normalized.last_resume_host = normalizeHostId(normalized.last_resume_host);
  normalized.last_resume_at = requireString(normalized.last_resume_at);

  return normalized;
}

export function normalizeNextAction(nextAction = {}) {
  const normalized = {
    ...DEFAULT_NEXT_ACTION,
    ...(nextAction && typeof nextAction === 'object' ? nextAction : {}),
  };

  normalized.kind = requireString(normalized.kind);
  normalized.skill = requireString(normalized.skill);
  normalized.target = requireString(normalized.target);
  normalized.reason = requireString(normalized.reason);
  normalized.summary = requireString(normalized.summary);
  normalized.updated_at = requireString(normalized.updated_at);

  return normalized;
}

export function appendRecent(list, entry, limit = 20) {
  return [entry, ...list].slice(0, limit);
}
