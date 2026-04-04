import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join, resolve } from 'path';

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

export function readJsonFile(path, fallback = null) {
  if (!existsSync(path)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    process.stderr.write(`[Forge] warning: failed to parse ${path}: ${err.message}\n`);
    return fallback;
  }
}

export function writeJsonFile(path, value) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
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
  return ['unknown', 'blocked', 'in_progress', 'ready_for_review', 'delivered'].includes(lowered)
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

export function appendRecent(list, entry, limit = 20) {
  return [entry, ...list].slice(0, limit);
}
