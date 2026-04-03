import { existsSync, rmSync } from 'fs';
import { join } from 'path';

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
