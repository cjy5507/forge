import { existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const CLEANUP_PATHS = [
  ['.forge', 'session-artifacts'],
  ['.forge', 'session-logs'],
  ['.forge', 'session-state'],
];

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;
const DEFAULT_SESSION_PRUNE_MS = ONE_HOUR_MS;

export function cleanupSessionArtifacts(cwd = '.') {
  const removed = [];

  for (const segments of CLEANUP_PATHS) {
    const target = join(cwd, ...segments);
    if (!existsSync(target)) {
      continue;
    }

    rmSync(target, { recursive: true, force: true });
    removed.push(target);
  }

  const forgeErrorLog = join(cwd, '.forge', 'errors.log');
  if (existsSync(forgeErrorLog)) {
    const forgeErrorLogPrev = join(cwd, '.forge', 'errors.log.prev');
    if (existsSync(forgeErrorLogPrev)) {
      rmSync(forgeErrorLogPrev, { force: true });
    }
    renameSync(forgeErrorLog, forgeErrorLogPrev);
    removed.push(forgeErrorLog);
  }

  removed.push(...pruneStaleSessions(cwd));

  return removed;
}

/**
 * Remove `.forge/sessions/*.jsonl` files older than `thresholdMs` (default 1h).
 * Prevents prior session transcripts from leaking into a new run's context.
 */
export function pruneStaleSessions(cwd = '.', thresholdMs = DEFAULT_SESSION_PRUNE_MS) {
  const sessionsDir = join(cwd, '.forge', 'sessions');
  if (!existsSync(sessionsDir)) return [];

  const removed = [];
  const cutoff = Date.now() - thresholdMs;

  let entries;
  try {
    entries = readdirSync(sessionsDir);
  } catch {
    return removed;
  }

  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const target = join(sessionsDir, name);
    let mtimeMs;
    try {
      mtimeMs = statSync(target).mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs < cutoff) {
      rmSync(target, { force: true });
      removed.push(target);
    }
  }

  return removed;
}

/**
 * Inspect `.forge/` for staleness markers without mutating it.
 * Returns:
 *   - exists:        whether `.forge/state.json` is present
 *   - lastTouchedMs: most recent activity timestamp (state.json mtime or runtime stats), or null
 *   - elapsedMs:     ms since lastTouchedMs (Infinity if unknown)
 *   - tier:          'fresh' (<1h), 'warm' (<24h), 'stale' (>=24h), or 'absent'
 *   - orphanSessions: count of `.forge/sessions/*.jsonl` older than 1h
 */
export function detectStaleForgeWorkspace(cwd = '.', staleThresholdMs = TWENTY_FOUR_HOURS_MS) {
  const statePath = join(cwd, '.forge', 'state.json');
  const runtimePath = join(cwd, '.forge', 'runtime.json');
  const sessionsDir = join(cwd, '.forge', 'sessions');

  if (!existsSync(statePath)) {
    return { exists: false, lastTouchedMs: null, elapsedMs: Infinity, tier: 'absent', orphanSessions: 0 };
  }

  let lastTouchedMs = null;

  try {
    if (existsSync(runtimePath)) {
      const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
      const ts = runtime?.stats?.last_finished_at || runtime?.updated_at;
      if (ts) {
        const parsed = new Date(ts).getTime();
        if (Number.isFinite(parsed)) lastTouchedMs = parsed;
      }
    }
  } catch { /* runtime unreadable, fall back to mtime */ }

  if (lastTouchedMs == null) {
    try {
      lastTouchedMs = statSync(statePath).mtimeMs;
    } catch { /* keep null */ }
  }

  const elapsedMs = lastTouchedMs == null ? Infinity : Math.max(0, Date.now() - lastTouchedMs);
  const tier = elapsedMs < ONE_HOUR_MS ? 'fresh'
    : elapsedMs < staleThresholdMs ? 'warm'
    : 'stale';

  let orphanSessions = 0;
  if (existsSync(sessionsDir)) {
    try {
      const cutoff = Date.now() - ONE_HOUR_MS;
      for (const name of readdirSync(sessionsDir)) {
        if (!name.endsWith('.jsonl')) continue;
        try {
          if (statSync(join(sessionsDir, name)).mtimeMs < cutoff) orphanSessions += 1;
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  return { exists: true, lastTouchedMs, elapsedMs, tier, orphanSessions };
}

/**
 * Move stale `.forge/` aside so a new run starts clean. Returns the archive path,
 * or null if there was nothing to archive. Caller decides when to invoke this
 * (e.g., intake when tier === 'stale' or user requests --fresh).
 */
export function archiveForgeWorkspace(cwd = '.') {
  const forgeDir = join(cwd, '.forge');
  if (!existsSync(forgeDir)) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = join(cwd, `.forge.archive-${stamp}`);
  renameSync(forgeDir, archivePath);
  return archivePath;
}

export function clearHudCustomLine() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) return;
  const hudConfigPath = join(homeDir, '.claude', 'plugins', 'claude-hud', 'config.json');
  if (!existsSync(hudConfigPath)) return;
  try {
    const config = JSON.parse(readFileSync(hudConfigPath, 'utf8'));
    if (config.display?.customLine) {
      delete config.display.customLine;
      writeFileSync(hudConfigPath, JSON.stringify(config, null, 2) + '\n');
    }
  } catch { /* HUD not installed or config broken */ }
}

export function cleanupForgeBranches(cwd = '.', runtime) {
  const cleaned = [];
  const lanes = runtime?.lanes || {};
  const doneStatuses = new Set(['done', 'merged']);

  // Collect forge/* branches from done/merged lanes
  const branchesToDelete = [];
  for (const lane of Object.values(lanes)) {
    if (!doneStatuses.has(lane.status)) continue;
    // Lane is done — check for matching forge/* branch
    const laneId = lane.id || '';
    if (laneId) branchesToDelete.push(`forge/${laneId}`);
  }

  if (branchesToDelete.length === 0) return cleaned;

  // Get existing branches
  const result = spawnSync('git', ['branch', '--list', 'forge/*'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) return cleaned;

  const existing = new Set(
    String(result.stdout).split('\n')
      .map(b => b.trim().replace(/^\* /, ''))
      .filter(Boolean),
  );

  for (const branch of branchesToDelete) {
    if (!existing.has(branch)) continue;
    const del = spawnSync('git', ['branch', '-d', branch], { cwd, encoding: 'utf8' });
    if (del.status === 0) cleaned.push(branch);
  }

  // Prune stale worktree metadata
  spawnSync('git', ['worktree', 'prune'], { cwd, encoding: 'utf8' });

  return cleaned;
}

/**
 * Compact runtime state by evicting terminal (done/merged) lanes beyond
 * a retention limit and pruning oversized recent_* arrays.
 * Returns the number of entries removed, or 0 if no compaction was needed.
 */
export function compactRuntimeState(runtime) {
  if (!runtime || typeof runtime !== 'object') {
    return { compacted: false, evictedLanes: 0, prunedEntries: 0 };
  }

  const TERMINAL_STATUSES = new Set(['done', 'merged']);
  const MAX_TERMINAL_LANES = 10;
  const MAX_RECENT = 20;
  let evictedLanes = 0;
  let prunedEntries = 0;

  // Evict excess terminal lanes (keep most recent MAX_TERMINAL_LANES)
  const lanes = runtime.lanes && typeof runtime.lanes === 'object' ? runtime.lanes : {};
  const terminal = [];
  const active = [];
  for (const [id, lane] of Object.entries(lanes)) {
    const status = String(lane?.status || '').toLowerCase();
    if (TERMINAL_STATUSES.has(status)) {
      terminal.push([id, lane]);
    } else {
      active.push([id, lane]);
    }
  }

  if (terminal.length > MAX_TERMINAL_LANES) {
    // Sort by last_event_at ascending (oldest first) so we keep the newest
    terminal.sort((a, b) => {
      const ta = a[1]?.last_event_at || '';
      const tb = b[1]?.last_event_at || '';
      return ta.localeCompare(tb);
    });
    const toEvict = terminal.length - MAX_TERMINAL_LANES;
    const kept = terminal.slice(toEvict);
    evictedLanes = toEvict;
    runtime.lanes = Object.fromEntries([...active, ...kept]);
  }

  // Prune recent_agents
  if (Array.isArray(runtime.recent_agents) && runtime.recent_agents.length > MAX_RECENT) {
    prunedEntries += runtime.recent_agents.length - MAX_RECENT;
    runtime.recent_agents = runtime.recent_agents.slice(0, MAX_RECENT);
  }

  // Prune recent_failures
  if (Array.isArray(runtime.recent_failures) && runtime.recent_failures.length > MAX_RECENT) {
    prunedEntries += runtime.recent_failures.length - MAX_RECENT;
    runtime.recent_failures = runtime.recent_failures.slice(0, MAX_RECENT);
  }

  // Clear stale active_agents (agents not in any active lane)
  if (runtime.active_agents && typeof runtime.active_agents === 'object') {
    const activeAgentIds = Object.keys(runtime.active_agents);
    for (const agentId of activeAgentIds) {
      const agent = runtime.active_agents[agentId];
      if (agent?.status === 'stopped' || agent?.status === 'failed') {
        delete runtime.active_agents[agentId];
        prunedEntries += 1;
      }
    }
  }

  return {
    compacted: evictedLanes > 0 || prunedEntries > 0,
    evictedLanes,
    prunedEntries,
  };
}
