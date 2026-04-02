import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function logHookError(error, hookName, cwd = '.') {
  const logPath = `${cwd}/.forge/errors.log`;
  try {
    const dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const entry = `[${new Date().toISOString()}] [${hookName}] ${error?.message || error}\n`;
    appendFileSync(logPath, entry);
  } catch {
    // If we can't even log, truly nothing to do
  }
}

export function handleHookError(error, hookName, cwd = '.') {
  logHookError(error, hookName, cwd);
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: hookName,
      additionalContext: `[Forge Error] ${hookName} encountered an issue. Check .forge/errors.log for details.`,
    },
  }));
}
