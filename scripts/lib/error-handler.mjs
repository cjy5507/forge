import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function logHookError(error, hookName, cwd = '.', { severity = 'warn' } = {}) {
  const logPath = `${cwd}/.forge/errors.log`;
  try {
    const dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const entry = `[${new Date().toISOString()}] [${severity}] [${hookName}] ${error?.message || error}\n`;
    appendFileSync(logPath, entry);
  } catch {
    // If we can't even log, truly nothing to do
  }
}

export function handleHookError(error, hookName, cwd = '.', { severity = 'warning' } = {}) {
  logHookError(error, hookName, cwd, { severity });

  if (severity === 'critical') {
    console.log(JSON.stringify({
      continue: false,
      permissionDecision: 'deny',
      hookSpecificOutput: {
        hookEventName: hookName,
        additionalContext: `[Forge Critical] ${hookName} failed: ${error?.message || error}. Operation blocked for safety.`,
      },
    }));
    return;
  }

  if (severity === 'info') {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
    }));
    return;
  }

  // Default: 'warning'
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: false,
    hookSpecificOutput: {
      hookEventName: hookName,
      additionalContext: `[Forge Warning] ${hookName} encountered an issue. Check .forge/errors.log for details.`,
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
