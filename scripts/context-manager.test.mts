import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-hooks-'));
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function writeState(cwd: string, overrides = {}) {
  const state = {
    version: '0.1.0',
    project: 'test-project',
    phase: 3,
    phase_id: 'develop',
    phase_index: 3,
    phase_name: 'develop',
    status: 'active',
    created_at: '',
    updated_at: '',
    client_name: '',
    agents_active: [],
    spec_approved: true,
    design_approved: true,
    tasks: [],
    holes: [],
    pr_queue: [],
    version_tag: 'v1',
    rollback_tags: [],
    ...overrides,
  };

  writeFileSync(join(cwd, '.forge', 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
}

function writeRuntime(cwd: string, overrides = {}) {
  const runtime = {
    active_tier: 'full',
    version: 3,
    ...overrides,
  };

  writeFileSync(join(cwd, '.forge', 'runtime.json'), `${JSON.stringify(runtime, null, 2)}\n`);
}

function runHook(scriptName: string, cwd: string, payload = {}, options: any = {}) {
  const scriptPath = join(FORGE_ROOT, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    input: JSON.stringify({ cwd, ...payload }),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Hook ${scriptName} failed with code ${result.status}:\n${result.stderr}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`Failed to parse hook output:\n${result.stdout}`);
  }
}

describe('context-manager hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits compact context for medium tier', () => {
    writeState(tmpDir, { phase: 'develop', mode: 'build' });
    writeRuntime(tmpDir, { active_tier: 'medium' });

    const output = runHook('context-manager.mjs', tmpDir, {}, { env: { FORGE_TIER: 'medium' } });

    expect(output.continue).toBe(true);
    expect(output.additionalContext).toBeDefined();
    expect(output.additionalContext).toContain('[Forge] build medium develop');
  });

  it('emits compact context for full tier', () => {
    writeState(tmpDir, { phase: 'design', phase_id: 'design', phase_name: 'design', mode: 'build', design_approved: false });
    writeRuntime(tmpDir, { active_tier: 'full' });

    const output = runHook('context-manager.mjs', tmpDir, {}, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.additionalContext).toBeDefined();
    expect(output.additionalContext).toContain('[Forge] build full design');
    expect(output.additionalContext).toContain('×design'); // Checking the symbol used in compactForgeContext
  });

  it('suppresses output when FORGE_TIER is off', () => {
    writeState(tmpDir, { phase: 'develop' });

    const output = runHook('context-manager.mjs', tmpDir, {}, { env: { FORGE_TIER: 'off' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
    expect(output.additionalContext).toBeUndefined();
  });

  it('suppresses output when FORGE_TIER is light', () => {
    writeState(tmpDir, { phase: 'develop' });

    const output = runHook('context-manager.mjs', tmpDir, {}, { env: { FORGE_TIER: 'light' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
    expect(output.additionalContext).toBeUndefined();
  });

  it('suppresses output if there is no state.json', () => {
    // Intentionally omit writeState
    writeRuntime(tmpDir, { active_tier: 'full' });

    const output = runHook('context-manager.mjs', tmpDir, {}, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
    expect(output.additionalContext).toBeUndefined();
  });
});
