import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function handleHookError(error, hookName) {
  const logFile = '.forge/errors.log';
  try {
    const dir = dirname(logFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const entry = `[${new Date().toISOString()}] [${hookName}] ${error?.message || error}\n`;
    appendFileSync(logFile, entry);
  } catch {
    // If we can't even log, truly nothing to do
  }
  console.log(JSON.stringify({
    continue: true,
    additionalContext: `[Forge Error] ${hookName} encountered an issue. Check .forge/errors.log for details.`
  }));
}
