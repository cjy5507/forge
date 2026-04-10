// Forge Read Tracker — file-based read counter (persists across hook invocations)
// Each hook call is a separate process, so in-memory state doesn't work.
// Uses a lightweight JSON file in .forge/ for session-scoped counting.

import { resolve, join } from 'path';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const READ_BUDGET_THRESHOLD = 3;
const TRACKER_FILE = '.forge/read-counts.json';

// Paths that should never trigger read budget warnings
const FORGE_PREFIX = '.forge/';
const EXCLUDED_EXTENSIONS = new Set(['.json', '.md', '.txt', '.yaml', '.yml', '.toml']);

/**
 * Normalize a file path for consistent counting.
 */
function normalizePath(filePath) {
  if (typeof filePath !== 'string') return '';
  return resolve(filePath);
}

/**
 * Read the current counts from disk. Returns {} on any failure.
 */
function loadCounts(cwd) {
  try {
    const path = join(cwd || '.', TRACKER_FILE);
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Write counts to disk. Non-fatal on failure.
 */
function saveCounts(cwd, counts) {
  try {
    const dir = join(cwd || '.', '.forge');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(cwd || '.', TRACKER_FILE), JSON.stringify(counts));
  } catch { /* save failure is non-fatal */ }
}

/**
 * Check if a file should be excluded from read budget tracking.
 * Excludes .forge/ internal files and non-code files.
 */
export function isExcludedFromBudget(filePath) {
  if (typeof filePath !== 'string' || !filePath) return true;
  if (filePath.includes(FORGE_PREFIX)) return true;
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return EXCLUDED_EXTENSIONS.has(ext);
}

/**
 * Track a file read. Returns the new read count for this file.
 * Persists to .forge/read-counts.json.
 */
export function trackFileRead(filePath, cwd) {
  const key = normalizePath(filePath);
  if (!key) return 0;
  const counts = loadCounts(cwd);
  const count = (counts[key] || 0) + 1;
  counts[key] = count;
  saveCounts(cwd, counts);
  return count;
}

/**
 * Get the current read count for a file without incrementing.
 */
export function getReadCount(filePath, cwd) {
  const counts = loadCounts(cwd);
  return counts[normalizePath(filePath)] || 0;
}

/**
 * Build a read budget suggestion message.
 * Returns null if below threshold.
 */
export function buildReadBudgetHint(filePath, count) {
  if (count < READ_BUDGET_THRESHOLD) return null;
  const basename = filePath.split('/').pop() || filePath;
  return `File "${basename}" has been read ${count} times this session. Consider using offset/limit to read only the section you need, or cache key information from earlier reads.`;
}
