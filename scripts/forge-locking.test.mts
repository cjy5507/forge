import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LockError, withRetry } from './lib/error-handler.mjs';
import { withForgeLock } from './lib/forge-io.mjs';

const TEMP_DIRS: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-locking-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe('withRetry', () => {
  it('retries until the operation succeeds', () => {
    let attempts = 0;

    const result = withRetry(() => {
      attempts += 1;
      if (attempts < 3) {
        throw Object.assign(new Error('busy'), { code: 'EAGAIN' });
      }
      return 'ok';
    }, {
      maxRetries: 5,
      retryDelay: 1,
      shouldRetry: err => err?.code === 'EAGAIN',
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws the provided exhausted error after retries are spent', () => {
    expect(() => withRetry(() => {
      throw Object.assign(new Error('locked'), { code: 'ELOCKED' });
    }, {
      maxRetries: 2,
      retryDelay: 1,
      shouldRetry: err => err?.code === 'ELOCKED',
      onExhausted: (_err, retries) => new LockError(`exhausted after ${retries}`),
    })).toThrow(/exhausted after 2/);
  });
});

describe('withForgeLock', () => {
  it('fails with LockError when the lock is fresh', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, '.forge', 'forge.lock'), `${process.pid}.${Date.now()}`);

    expect(() => withForgeLock(cwd, () => 'nope')).toThrow(/lock acquisition failed/i);
  });

  it('cleans up a stale lock and executes the callback', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, '.forge', 'forge.lock'), `${process.pid}.${Date.now() - 10000}`);

    const result = withForgeLock(cwd, () => 'ok');

    expect(result).toBe('ok');
  });
});
