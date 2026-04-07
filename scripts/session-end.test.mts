import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
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
    stats: {
      started_at: new Date(Date.now() - 5000).toISOString(), // 5 seconds ago
    },
    active_agents: { 'test-agent': true },
    recent_agents: [],
    ...overrides,
  };

  writeFileSync(join(cwd, '.forge', 'runtime.json'), `${JSON.stringify(runtime, null, 2)}\n`);
}

function readRuntime(cwd: string) {
  return JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
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

describe('session-end hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('updates runtime state with session end statistics', () => {
    writeState(tmpDir, { phase: 'develop' });
    writeRuntime(tmpDir, { active_tier: 'full' });

    const output = runHook('session-end.mjs', tmpDir, {}, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);

    const runtime = readRuntime(tmpDir);
    expect(runtime.active_agents).toEqual({});
    
    // Check if recent_agents is appended
    expect(runtime.recent_agents.length).toBeGreaterThan(0);
    expect(runtime.recent_agents[0].kind).toBe('session-end');
    expect(runtime.recent_agents[0].phase).toBe('develop');

    // Check stats
    expect(runtime.stats.last_finished_at).toBeTruthy();
    expect(runtime.stats.session_duration_ms).toBeGreaterThanOrEqual(0);

    // Check last_event
    expect(runtime.last_event.name).toBe('SessionEnd');
    expect(runtime.last_event.pending).toBeDefined();
  });

  it('cleans up session artifacts', () => {
    writeState(tmpDir, { phase: 'develop' });
    writeRuntime(tmpDir, { active_tier: 'full' });
    
    mkdirSync(join(tmpDir, '.forge', 'session-artifacts'));
    writeFileSync(join(tmpDir, '.forge', 'session-artifacts', 'current.md'), 'test');

    const output = runHook('session-end.mjs', tmpDir, {}, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);

    expect(existsSync(join(tmpDir, '.forge', 'session-artifacts', 'current.md'))).toBe(false);
  });

  it('works gracefully even without state.json', () => {
    // Intentionally omit writeState
    writeRuntime(tmpDir, { active_tier: 'full' });

    const output = runHook('session-end.mjs', tmpDir, {}, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);

    const runtime = readRuntime(tmpDir);
    expect(runtime.active_agents).toEqual({});
    expect(runtime.recent_agents[0].phase).toBe('none');
    expect(runtime.last_event.name).toBe('SessionEnd');
  });
});
