import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import {
  decomposeTask,
  analyzeTask,
  identifyComponents,
  calculateExecutionOrder,
  detectCycles,
} from './lib/task-decomposer.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const TEMP_DIRS: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-decompose-e2e-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function writeState(cwd: string, overrides = {}) {
  const state = {
    version: '0.1.0',
    project: 'decompose-test',
    phase: 'develop',
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

function readRuntime(cwd: string) {
  return JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
}

function runLaneRuntime(args: string[], cwd: string) {
  const result = spawnSync(
    process.execPath,
    [join(FORGE_ROOT, 'scripts', 'forge-lane-runtime.mjs'), ...args],
    { cwd, encoding: 'utf8', env: { ...process.env, FORGE_TIER: 'off' } },
  );
  return result;
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe('task decomposition pipeline', () => {
  it('analyzeTask correctly identifies fullstack app', () => {
    const result = analyzeTask(
      'Build a fullstack dashboard with database, auth, API and React frontend',
    );
    expect(result.taskType).toBe('fullstack-app');
    expect(result.areas).toContain('frontend');
    expect(result.areas).toContain('backend');
    expect(result.areas).toContain('database');
    expect(result.areas).toContain('auth');
    expect(result.parallelizable).toBe(true);
  });

  it('identifyComponents creates correct component structure for fullstack', () => {
    const analysis = analyzeTask(
      'Build a fullstack dashboard with database, auth, API and React frontend',
    );
    const components = identifyComponents(analysis);

    const ids = components.map((c: any) => c.id);
    expect(ids).toContain('shared');
    expect(ids).toContain('database');
    expect(ids).toContain('frontend');
    expect(ids).toContain('backend');
    expect(ids).toContain('auth');

    const backend = components.find((c: any) => c.id === 'backend')!;
    expect(backend.dependencies).toContain('database');
    expect(backend.dependencies).toContain('auth');

    const shared = components.find((c: any) => c.id === 'shared')!;
    expect(shared.dependencies).toEqual([]);
  });

  it('calculateExecutionOrder produces valid batches', () => {
    const analysis = analyzeTask(
      'Build a fullstack dashboard with database, auth, API and React frontend',
    );
    const components = identifyComponents(analysis);
    const batches = calculateExecutionOrder(components);

    // Shared has no deps, should be in batch 1
    expect(batches[0]).toContain('shared');

    // Frontend depends only on shared, so it can be in batch 2
    // Database also depends only on shared, so parallel with frontend
    const batch2Ids = batches[1] || [];
    expect(batch2Ids).toContain('frontend');
    expect(batch2Ids).toContain('database');

    // Backend depends on database + auth, so it must come after them
    const backendBatchIndex = batches.findIndex((b: string[]) => b.includes('backend'));
    const databaseBatchIndex = batches.findIndex((b: string[]) => b.includes('database'));
    expect(backendBatchIndex).toBeGreaterThan(databaseBatchIndex);
  });

  it('detectCycles catches circular dependencies', () => {
    const circular = [
      { id: 'a', dependencies: ['b'] },
      { id: 'b', dependencies: ['a'] },
    ];
    const cycles = detectCycles(circular);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('decomposeTask full pipeline returns complete result', () => {
    const result = decomposeTask(
      'Build fullstack dashboard with database, auth, API and React frontend',
    );

    expect(result).toHaveProperty('analysis');
    expect(result).toHaveProperty('components');
    expect(result).toHaveProperty('executionOrder');
    expect(result).toHaveProperty('summary');
    expect(result.components.length).toBeGreaterThanOrEqual(4);
    expect(result.executionOrder.length).toBeGreaterThanOrEqual(2);
    expect(typeof result.summary).toBe('string');
    expect(result.summary).toContain('fullstack-app');
  });

  it('auto-decompose CLI creates lanes in runtime.json', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const result = runLaneRuntime(
      ['auto-decompose', '--description', 'fullstack app with database and API backend'],
      cwd,
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    const runtime = readRuntime(cwd);
    expect(runtime.lanes).toBeDefined();
    const laneIds = Object.keys(runtime.lanes);
    expect(laneIds.length).toBeGreaterThanOrEqual(2);

    // Each lane should have scope and model_hint
    for (const id of laneIds) {
      const lane = runtime.lanes[id];
      expect(lane).toHaveProperty('scope');
      expect(lane).toHaveProperty('model_hint');
    }
  });

  it('dry-run mode does not create lanes', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const result = runLaneRuntime(
      ['auto-decompose', '--dry-run', '--description', 'fullstack app with database and API backend'],
      cwd,
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    // runtime.json may not exist at all, or if it does, lanes should be empty
    let lanes = {};
    try {
      const runtime = readRuntime(cwd);
      lanes = runtime.lanes || {};
    } catch {
      // No runtime.json means no lanes were created — that is correct
    }
    expect(Object.keys(lanes).length).toBe(0);
  });

  it('simple bug fix produces single component', () => {
    const analysis = analyzeTask('Fix the login button');
    const components = identifyComponents(analysis);

    expect(analysis.parallelizable).toBe(false);
    expect(components.length).toBe(1);
  });

  it('Korean input is correctly analyzed', () => {
    const analysis = analyzeTask('API 서버랑 데이터베이스 만들어줘');
    expect(analysis.areas).toContain('backend');
    expect(analysis.areas).toContain('database');
  });
});
