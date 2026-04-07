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

export class ForgeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ForgeError';
    this.code = code;
  }
}

export class LockError extends ForgeError {
  constructor(message) {
    super(message, 'ELOCKED');
    this.name = 'LockError';
  }
}

export function sleepSync(delay = 0) {
  const normalizedDelay = Math.max(0, Math.floor(Number(delay) || 0));
  if (normalizedDelay === 0) {
    return;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, normalizedDelay);
}

export function withRetry(operation, options = {}) {
  const {
    maxRetries = 5,
    retryDelay = 50,
    shouldRetry = () => true,
    onRetry = () => {},
    onExhausted = null,
  } = options;

  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return operation(attempt);
    } catch (err) {
      lastError = err;
      if (!shouldRetry(err)) throw err;
      onRetry(err, attempt);
      if (attempt === maxRetries - 1) {
        break;
      }
      const delay = retryDelay * Math.pow(2, attempt) + Math.random() * retryDelay;
      sleepSync(delay);
    }
  }

  if (typeof onExhausted === 'function') {
    throw onExhausted(lastError, maxRetries);
  }

  throw new LockError(`Operation failed after ${maxRetries} retries`);
}
