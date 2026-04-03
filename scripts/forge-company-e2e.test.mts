import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const TEMP_DIRS = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-company-e2e-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function writeState(cwd, overrides = {}) {
  const state = {
    version: '0.1.0',
    project: 'e2e-project',
    phase: 'discovery',
    phase_id: 'discovery',
    phase_index: 1,
    phase_name: 'discovery',
    status: 'active',
    created_at: '',
    updated_at: '',
    client_name: '',
    agents_active: [],
    spec_approved: false,
    design_approved: false,
    tasks: [],
    holes: [],
    pr_queue: [],
    version_tag: 'v1',
    rollback_tags: [],
    ...overrides,
  };

  writeFileSync(join(cwd, '.forge', 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
}

function readRuntime(cwd) {
  return JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
}

function runHook(scriptName, cwd, payload = {}) {
  const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', scriptName)], {
    cwd,
    input: JSON.stringify({ cwd, ...payload }),
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout || '{}');
}

function runLaneRuntime(cwd, args) {
  const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-lane-runtime.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  return result.stdout || '';
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop(), { recursive: true, force: true });
  }
});

describe('forge company e2e smoke', () => {
  it('keeps customer-review re-entry aligned across hooks and runtime cli', () => {
    const cwd = makeWorkspace();

    writeState(cwd, {
      phase: 'delivery',
      phase_id: 'delivery',
      phase_index: 7,
      phase_name: 'delivery',
      spec_approved: true,
      design_approved: true,
    });

    runHook('state-restore.mjs', cwd);

    runLaneRuntime(cwd, [
      'set-company-gate',
      '--gate',
      'customer_review',
      '--gate-owner',
      'pm',
      '--delivery-state',
      'in_progress',
      '--customer-blockers',
      'Need pricing signoff',
    ]);

    let runtime = readRuntime(cwd);
    expect(runtime.active_gate).toBe('customer_review');
    expect(runtime.next_session_owner).toBe('pm');

    let output = runHook('phase-detector.mjs', cwd, { message: 'forge status' });
    expect(output.hookSpecificOutput.additionalContext).toContain('→ forge:continue');
    expect(output.hookSpecificOutput.additionalContext).toContain('next:pm');

    writeState(cwd, {
      phase: 'fix',
      phase_id: 'fix',
      phase_index: 6,
      phase_name: 'fix',
      spec_approved: true,
      design_approved: true,
    });

    output = runHook('phase-detector.mjs', cwd, { message: 'forge status' });
    runtime = readRuntime(cwd);
    expect(runtime.active_gate).toBe('implementation_readiness');
    expect(runtime.next_session_owner).toBe('lead-dev');
    expect(output.hookSpecificOutput.additionalContext).toContain('→ forge:fix');
    expect(output.hookSpecificOutput.additionalContext).toContain('next:lead-dev');

    writeState(cwd, {
      phase: 'delivery',
      phase_id: 'delivery',
      phase_index: 7,
      phase_name: 'delivery',
      spec_approved: true,
      design_approved: true,
    });

    output = runHook('phase-detector.mjs', cwd, { message: 'forge status' });
    runtime = readRuntime(cwd);
    expect(runtime.active_gate).toBe('customer_review');
    expect(runtime.next_session_owner).toBe('pm');
    expect(output.hookSpecificOutput.additionalContext).toContain('→ forge:continue');
    expect(output.hookSpecificOutput.additionalContext).toContain('next:pm');
  });
});
