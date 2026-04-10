import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleHookError, logHookError } from './lib/error-handler.mjs';

const WORKSPACES: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-error-handler-'));
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  WORKSPACES.push(cwd);
  return cwd;
}

afterEach(() => {
  while (WORKSPACES.length > 0) {
    rmSync(WORKSPACES.pop()!, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('handleHookError severity routing', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('AC-E1: critical severity emits continue:false and permissionDecision:deny', () => {
    const cwd = makeWorkspace();
    const err = new Error('state corrupted');

    handleHookError(err, 'PreToolUse', cwd, { severity: 'critical' });

    expect(logSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.continue).toBe(false);
    expect(output.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(output.hookSpecificOutput.additionalContext).toContain('[Forge Critical]');
    expect(output.hookSpecificOutput.additionalContext).toContain('state corrupted');
  });

  it('AC-E2: warning severity emits continue:true with additionalContext', () => {
    const cwd = makeWorkspace();
    const err = new Error('parse failed');

    handleHookError(err, 'PostToolUse', cwd, { severity: 'warning' });

    expect(logSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(false);
    expect(output.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(output.hookSpecificOutput.additionalContext).toContain('[Forge Warning]');
  });

  it('AC-E3: no severity parameter defaults to warning behavior', () => {
    const cwd = makeWorkspace();
    const err = new Error('something went wrong');

    handleHookError(err, 'PreToolUse', cwd);

    expect(logSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(false);
    expect(output.hookSpecificOutput.additionalContext).toContain('[Forge Warning]');
  });

  it('AC-E4: info severity emits continue:true with suppressOutput:true', () => {
    const cwd = makeWorkspace();
    const err = new Error('expected fallback');

    handleHookError(err, 'PreToolUse', cwd, { severity: 'info' });

    expect(logSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toBeUndefined();
  });

  it('AC-E5: severity level is included in log file', () => {
    const cwd = makeWorkspace();
    const err = new Error('test error');

    handleHookError(err, 'PreToolUse', cwd, { severity: 'critical' });

    const logContent = readFileSync(join(cwd, '.forge', 'errors.log'), 'utf8');
    expect(logContent).toContain('[critical]');
    expect(logContent).toContain('[PreToolUse]');
    expect(logContent).toContain('test error');
  });

  it('critical severity includes error message from string errors', () => {
    const cwd = makeWorkspace();

    handleHookError('raw string error', 'PreToolUse', cwd, { severity: 'critical' });

    expect(logSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.hookSpecificOutput.additionalContext).toContain('raw string error');
  });

  it('backwards compat: old 3-arg call produces same continue:true behavior', () => {
    const cwd = makeWorkspace();
    const err = new Error('old caller');

    handleHookError(err, 'PostToolUse', cwd);

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.continue).toBe(true);
  });
});
