import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
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
    rmSync(forgeErrorLog, { force: true });
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
