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
  validateLLMResponse,
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

function makeFullstackWorkspace() {
  const cwd = makeWorkspace();
  const files = {
    'package.json': JSON.stringify({
      name: 'fullstack-fixture',
      private: true,
      dependencies: {
        react: '^19.0.0',
      },
    }, null, 2),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
      },
    }, null, 2),
    'src/types/shared.ts': 'export const shared = true;\n',
    'src/db/client.ts': 'import { shared } from "../types/shared";\nexport const db = shared;\n',
    'src/auth/session.ts': 'import { db } from "../db/client";\nexport const session = db;\n',
    'src/routes/api.ts': 'import { db } from "../db/client";\nimport { session } from "../auth/session";\nexport const handler = () => ({ db, session });\n',
    'src/components/App.tsx': 'import { shared } from "../types/shared";\nexport function App() { return <div>{String(shared)}</div>; }\n',
  };

  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(cwd, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }

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
    { cwd, encoding: 'utf8', env: { ...process.env, FORGE_TIER: 'off', FORGE_LLM_TIMEOUT_MS: '3000', FORGE_DECOMPOSER_DISABLE_LLM: '1' } },
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
    const cwd = makeFullstackWorkspace();
    const result = analyzeTask(
      'Build a fullstack dashboard with database, auth, API and React frontend',
      cwd,
    );
    expect(result.taskType).toBe('fullstack-app');
    expect(result.areas).toContain('frontend');
    expect(result.areas).toContain('backend');
    expect(result.areas).toContain('database');
    expect(result.areas).toContain('auth');
    expect(result.parallelizable).toBe(true);
  });

  it('identifyComponents creates correct component structure for fullstack', () => {
    const cwd = makeFullstackWorkspace();
    const analysis = analyzeTask(
      'Build a fullstack dashboard with database, auth, API and React frontend',
      cwd,
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
    const cwd = makeFullstackWorkspace();
    const analysis = analyzeTask(
      'Build a fullstack dashboard with database, auth, API and React frontend',
      cwd,
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
    const cwd = makeFullstackWorkspace();
    const result = decomposeTask(
      'Build fullstack dashboard with database, auth, API and React frontend',
      { cwd },
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
    const cwd = makeFullstackWorkspace();
    writeState(cwd);

    const result = runLaneRuntime(
      ['auto-decompose', '--description', 'fullstack app with database and API backend'],
      cwd,
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('[Forge] decomposition: using heuristic fallback');

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

  it('auto-decompose attaches requirement refs from traceability', () => {
    const cwd = makeFullstackWorkspace();
    writeState(cwd);
    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-05T00:00:00.000Z',
      requirements: [
        {
          id: 'FR-1',
          title: 'Authentication flow',
          summary: 'Users can sign in and keep a valid session',
          rationale: '',
          type: 'functional',
          phaseOwner: 'develop',
          status: 'planned',
          acceptanceCriteria: [{ id: 'FR-1-AC-1', text: 'Login succeeds', status: 'pending', evidenceRefs: [] }],
          designRefs: [],
          contractRefs: [],
          taskRefs: [],
          holeRefs: [],
          deliveryRefs: [],
        },
        {
          id: 'FR-2',
          title: 'API backend',
          summary: 'Expose backend API routes for dashboard data',
          rationale: '',
          type: 'functional',
          phaseOwner: 'develop',
          status: 'planned',
          acceptanceCriteria: [{ id: 'FR-2-AC-1', text: 'API returns data', status: 'pending', evidenceRefs: [] }],
          designRefs: [],
          contractRefs: [],
          taskRefs: [],
          holeRefs: [],
          deliveryRefs: [],
        },
      ],
    }, null, 2));

    const result = runLaneRuntime(
      ['auto-decompose', '--description', 'fullstack app with database and API backend plus auth'],
      cwd,
    );

    expect(result.status).toBe(0);

    const runtime = readRuntime(cwd);
    expect(runtime.lanes.auth.requirement_refs).toContain('FR-1');
    expect(runtime.lanes.auth.acceptance_refs).toContain('FR-1-AC-1');
    expect(runtime.lanes.backend.requirement_refs).toContain('FR-2');
    expect(runtime.lanes.backend.acceptance_refs).toContain('FR-2-AC-1');
  });

  it('dry-run mode does not create lanes', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const result = runLaneRuntime(
      ['auto-decompose', '--dry-run', '--description', 'fullstack app with database and API backend'],
      cwd,
    );

    expect(result.status).toBe(0);
    // LLM fallback warnings on stderr are expected (graceful degradation)

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
    const cwd = makeFullstackWorkspace();
    const analysis = analyzeTask('Fix the login button', cwd);
    const components = identifyComponents(analysis);

    expect(analysis.taskType).toBe('bug-fix');
    expect(analysis.parallelizable).toBe(false);
    expect(components.length).toBe(1);
  });

  it('testing prompts are not misclassified as fullstack-app', () => {
    const cwd = makeFullstackWorkspace();
    const analysis = analyzeTask('test website', cwd);

    expect(analysis.taskType).toBe('testing');
    expect(analysis.areas).toContain('testing');
  });

  it('script-first repos do not get fabricated src scopes from heuristic decomposition', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'script-only', private: true }, null, 2));
    mkdirSync(join(cwd, 'scripts'), { recursive: true });
    writeFileSync(join(cwd, 'scripts', 'index.mjs'), 'export const ok = true;\n');

    const result = decomposeTask('build a website with login and database', { cwd });

    expect(result.analysis.llmUsed).toBe(false);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].id).toBe('main');
    expect(result.components[0].filePatterns).toEqual([]);
  });

  it('Korean input is correctly analyzed', () => {
    const analysis = analyzeTask('API 서버랑 데이터베이스 만들어줘');
    expect(analysis.areas).toContain('backend');
    expect(analysis.areas).toContain('database');
  });

  it('validateLLMResponse accepts well-formed LLM output', () => {
    const mockLLMResponse = {
      taskType: 'fullstack-app',
      complexity: 0.7,
      parallelizable: true,
      components: [
        {
          id: 'shared',
          title: 'Shared types and config',
          areas: ['config'],
          filePatterns: ['src/shared/**'],
          dependencies: [],
          modelHint: 'sonnet',
        },
        {
          id: 'api',
          title: 'API server',
          areas: ['backend'],
          filePatterns: ['src/api/**'],
          dependencies: ['shared'],
          modelHint: 'sonnet',
        },
        {
          id: 'frontend',
          title: 'React dashboard',
          areas: ['frontend'],
          filePatterns: ['src/ui/**'],
          dependencies: ['shared'],
          modelHint: 'sonnet',
        },
      ],
    };

    const result = validateLLMResponse(mockLLMResponse);
    expect(result.valid).toBe(true);
    expect(result.errors || []).toHaveLength(0);
    expect(result.data.components).toHaveLength(3);
  });

  it('validateLLMResponse rejects malformed LLM output', () => {
    const badResponse = {
      taskType: 'invalid-type',
      complexity: 2.0,
      parallelizable: 'yes',
      components: [],
    };

    const result = validateLLMResponse(badResponse);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validateLLMResponse strips invalid dependency references', () => {
    const response = {
      taskType: 'fullstack-app',
      complexity: 0.5,
      parallelizable: true,
      components: [
        {
          id: 'a',
          title: 'Component A',
          areas: ['backend'],
          filePatterns: ['src/a/**'],
          dependencies: ['nonexistent'],
          modelHint: 'sonnet',
        },
      ],
    };

    const result = validateLLMResponse(response);
    expect(result.valid).toBe(true);
    // Referential integrity: invalid dep should be stripped
    expect(result.data.components[0].dependencies).not.toContain('nonexistent');
  });
});
