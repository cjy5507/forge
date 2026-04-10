import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { createHash } from 'crypto';
import { withRetry, LockError } from './error-handler.mjs';
import { normalizeLocale } from './forge-locale.mjs';

/** @typedef {import('../../types/forge-state').ForgeAnalysisMeta} ForgeAnalysisMeta */
/** @typedef {import('../../types/forge-state').ForgeHostContext} ForgeHostContext */
/** @typedef {import('../../types/forge-state').ForgeNextAction} ForgeNextAction */
/** @typedef {import('../../types/forge-state').ForgeRuntime} ForgeRuntime */
/** @typedef {import('../../types/forge-state').ForgeStats} ForgeStats */
/** @typedef {import('../../types/forge-state').ForgeHarnessPolicy} ForgeHarnessPolicy */

const activeLocks = new Set();
const LOCK_STALE_MS = 5000;
const LOCK_FUTURE_SKEW_MS = 1000;
const DANGEROUS_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const FORGE_PROJECT_DIRS = [
  'design',
  'contracts',
  'evidence',
  'holes',
  'tasks',
  'worktrees',
  'knowledge',
  'delivery-report',
  'eval',
  'events',
];
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

function quarantineLockPath(lockPath) {
  return `${lockPath}.reclaimed.${process.pid}.${Date.now()}`;
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
      const reclaimedPath = quarantineLockPath(lockPath);
      try {
        renameSync(lockPath, reclaimedPath);
        try { unlinkSync(reclaimedPath); } catch { /* quarantine cleanup is best-effort — file will be orphaned but harmless */ }
      } catch { /* rename to quarantine may race with another process — acceptable, lock will be re-checked on next attempt */ }
    }
  } catch { /* lock file may have been removed between check and read — benign race condition */ }
}

export function sanitizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(entry => sanitizeJsonValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (DANGEROUS_JSON_KEYS.has(key)) {
      continue;
    }
    sanitized[key] = sanitizeJsonValue(entry);
  }

  return sanitized;
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

/** @type {ForgeStats} */
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

/** @type {ForgeAnalysisMeta} */
export const DEFAULT_ANALYSIS = {
  last_type: '',
  last_target: '',
  artifact_path: '',
  locale: 'en',
  graph_health: 'unknown',
  confidence: 'unknown',
  risk_level: 'unknown',
  summary: '',
  updated_at: '',
  stale: false,
};

/** @type {ForgeNextAction} */
export const DEFAULT_NEXT_ACTION = {
  kind: '',
  skill: '',
  target: '',
  reason: '',
  summary: '',
  updated_at: '',
};

/** @type {ForgeHostContext} */
export const DEFAULT_HOST_CONTEXT = {
  current_host: '',
  previous_host: '',
  last_event_host: '',
  last_event_name: '',
  last_resume_host: '',
  last_resume_at: '',
};

export const DEFAULT_TOOLING = {
  package_manager: '',
  package_manager_source: '',
  detected_commands: {
    lint: '',
    typecheck: '',
    test: '',
    build: '',
    format: '',
  },
  edited_files: [],
  last_batch_check: {
    at: '',
    status: '',
    summary: '',
    commands: [],
  },
};

/** @type {ForgeHarnessPolicy} */
export const DEFAULT_HARNESS_POLICY = {
  strictness_mode: 'guarded',
  verification_mode: 'targeted',
  host_posture: 'bounded_degraded',
  override_policy: 'explicit_only',
  decision_trace_enabled: true,
};

export const DEFAULT_DECISION_TRACE = {
  latest: null,
  recent: [],
};

export const DEFAULT_VERIFICATION = {
  updated_at: '',
  edited_files: [],
  lane_refs: [],
  selected_checks: [],
  status: '',
  summary: '',
};

export const DEFAULT_RECOVERY = {
  latest: null,
  active: [],
};

/** @type {ForgeRuntime} */
export const DEFAULT_RUNTIME = {
  version: 3,
  active_tier: 'light',
  detected_locale: 'en',
  preferred_locale: 'en',
  last_task_type: 'general',
  behavioral_profile: '',
  active_prescriptions: [],
  behavioral_counters: {
    total_prompts: 0,
    question_prompts: 0,
    design_improvement_requests: 0,
  },
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
  harness_policy: { ...DEFAULT_HARNESS_POLICY },
  decision_trace: structuredClone(DEFAULT_DECISION_TRACE),
  verification: structuredClone(DEFAULT_VERIFICATION),
  recovery: structuredClone(DEFAULT_RECOVERY),
  tooling: structuredClone(DEFAULT_TOOLING),
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

export function ensureForgeProjectLayout(cwd = '.') {
  const forgeDir = ensureForgeDir(cwd);
  for (const dir of FORGE_PROJECT_DIRS) {
    mkdirSync(join(forgeDir, dir), { recursive: true });
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
      value: sanitizeJsonValue(JSON.parse(readFileSync(path, 'utf8'))),
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

export function normalizeToolingState(tooling = {}) {
  const source = tooling && typeof tooling === 'object' ? tooling : {};
  const detectedCommandsSource = source.detected_commands && typeof source.detected_commands === 'object'
    ? source.detected_commands
    : {};
  const lastBatchCheckSource = source.last_batch_check && typeof source.last_batch_check === 'object'
    ? source.last_batch_check
    : {};

  return {
    ...DEFAULT_TOOLING,
    package_manager: requireString(source.package_manager),
    package_manager_source: requireString(source.package_manager_source),
    detected_commands: {
      lint: requireString(detectedCommandsSource.lint),
      typecheck: requireString(detectedCommandsSource.typecheck),
      test: requireString(detectedCommandsSource.test),
      build: requireString(detectedCommandsSource.build),
      format: requireString(detectedCommandsSource.format),
    },
    edited_files: normalizeStringList(source.edited_files).slice(-100),
    last_batch_check: {
      at: requireString(lastBatchCheckSource.at),
      status: requireString(lastBatchCheckSource.status),
      summary: requireString(lastBatchCheckSource.summary),
      commands: normalizeStringList(lastBatchCheckSource.commands),
    },
  };
}

export function normalizeHarnessPolicy(policy = {}) {
  const source = policy && typeof policy === 'object' ? policy : {};

  return {
    ...DEFAULT_HARNESS_POLICY,
    strictness_mode: requireString(source.strictness_mode, DEFAULT_HARNESS_POLICY.strictness_mode) || DEFAULT_HARNESS_POLICY.strictness_mode,
    verification_mode: requireString(source.verification_mode, DEFAULT_HARNESS_POLICY.verification_mode) || DEFAULT_HARNESS_POLICY.verification_mode,
    host_posture: requireString(source.host_posture, DEFAULT_HARNESS_POLICY.host_posture) || DEFAULT_HARNESS_POLICY.host_posture,
    override_policy: requireString(source.override_policy, DEFAULT_HARNESS_POLICY.override_policy) || DEFAULT_HARNESS_POLICY.override_policy,
    decision_trace_enabled: source.decision_trace_enabled !== false,
  };
}

export function normalizeDecisionTrace(trace = {}) {
  const source = trace && typeof trace === 'object' ? trace : {};
  const latest = source.latest && typeof source.latest === 'object'
    ? source.latest
    : null;
  const recent = Array.isArray(source.recent) ? source.recent : [];

  const normalizeEntry = (entry = {}) => ({
    at: requireString(entry.at),
    scope: requireString(entry.scope),
    kind: requireString(entry.kind),
    target: requireString(entry.target),
    summary: requireString(entry.summary),
    inputs: normalizeStringList(entry.inputs),
    policy_snapshot: requireString(entry.policy_snapshot),
  });

  return {
    latest: latest ? normalizeEntry(latest) : null,
    recent: recent
      .filter(entry => entry && typeof entry === 'object')
      .map(normalizeEntry)
      .slice(0, 20),
  };
}

export function normalizeVerificationState(verification = {}) {
  const source = verification && typeof verification === 'object' ? verification : {};
  const checks = Array.isArray(source.selected_checks) ? source.selected_checks : [];

  return {
    ...DEFAULT_VERIFICATION,
    updated_at: requireString(source.updated_at),
    edited_files: normalizeStringList(source.edited_files),
    lane_refs: normalizeStringList(source.lane_refs),
    selected_checks: checks
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => ({
        id: requireString(entry.id),
        reason: requireString(entry.reason),
        command: requireString(entry.command),
      })),
    status: requireString(source.status),
    summary: requireString(source.summary),
  };
}

export function normalizeRecoveryState(recovery = {}) {
  const source = recovery && typeof recovery === 'object' ? recovery : {};
  const normalizeItem = (entry = {}) => ({
    id: requireString(entry.id),
    at: requireString(entry.at),
    category: requireString(entry.category),
    lane_id: requireString(entry.lane_id),
    phase_id: requireString(entry.phase_id),
    command: requireString(entry.command),
    guidance: requireString(entry.guidance),
    suggested_command: requireString(entry.suggested_command),
    retry_count: Number(entry.retry_count || 0),
    max_retry_count: Number(entry.max_retry_count || 0),
    status: requireString(entry.status),
    summary: requireString(entry.summary),
    escalation_reason: requireString(entry.escalation_reason),
  });

  return {
    ...DEFAULT_RECOVERY,
    latest: source.latest && typeof source.latest === 'object' ? normalizeItem(source.latest) : null,
    active: Array.isArray(source.active)
      ? source.active.filter(entry => entry && typeof entry === 'object').map(normalizeItem).slice(0, 20)
      : [],
  };
}

export function normalizeAnalysisMeta(analysis = {}) {
  const normalized = {
    ...DEFAULT_ANALYSIS,
    ...(analysis && typeof analysis === 'object' ? analysis : {}),
  };

  normalized.last_type = requireString(normalized.last_type);
  normalized.last_target = requireString(normalized.last_target);
  normalized.artifact_path = requireString(normalized.artifact_path);
  normalized.locale = normalizeLocale(normalized.locale, 'en');
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

export function stripIntegrityMetadata(value) {
  if (Array.isArray(value)) {
    return value.map(entry => stripIntegrityMetadata(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const cloned = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === '_integrity') {
      continue;
    }
    cloned[key] = stripIntegrityMetadata(entry);
  }
  return cloned;
}

export function computeIntegrityFingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(stripIntegrityMetadata(value)))
    .digest('hex');
}

export function stampIntegrity(value, kind = 'unknown') {
  return {
    ...stripIntegrityMetadata(value),
    _integrity: {
      fingerprint: computeIntegrityFingerprint(value),
      kind,
      recorded_at: new Date().toISOString(),
      source: 'forge',
    },
  };
}
