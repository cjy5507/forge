import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const CLEANUP_PATHS = [
  ['.forge', 'session-artifacts'],
  ['.forge', 'session-logs'],
  ['.forge', 'session-state'],
];

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

  return removed;
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
