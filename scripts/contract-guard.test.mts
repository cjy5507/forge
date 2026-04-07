import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
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

describe('contract-guard hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('suppresses output when no contracts exist', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    const output = runHook('contract-guard.mjs', tmpDir, { file_path: 'src/app.ts' }, { env: { FORGE_TIER: 'full' } });
    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
  });

  it('lists contracts when they exist for full tier high risk', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    mkdirSync(join(tmpDir, '.forge', 'contracts'), { recursive: true });
    writeFileSync(join(tmpDir, '.forge', 'contracts', 'api.ts'), 'export interface API {}');

    const output = runHook('contract-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: 'package.json', content: '{"dependencies":{}}' },
    }, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.hookSpecificOutput?.additionalContext).toBeTruthy();
    expect(output.hookSpecificOutput.additionalContext).toContain('api.ts');
  });

  it('suppresses output for medium tier with low risk writes', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'medium' });
    mkdirSync(join(tmpDir, '.forge', 'contracts'), { recursive: true });
    writeFileSync(join(tmpDir, '.forge', 'contracts', 'api.ts'), 'export interface API {}');

    const output = runHook('contract-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts', content: 'console.log("low risk");' },
    }, { env: { FORGE_TIER: 'medium' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
  });

  it('lists contracts for medium tier with high risk writes', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'medium' });
    mkdirSync(join(tmpDir, '.forge', 'contracts'), { recursive: true });
    writeFileSync(join(tmpDir, '.forge', 'contracts', 'api.ts'), 'export interface API {}');

    const output = runHook('contract-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: 'package.json', content: '{"dependencies":{}}' },
    }, { env: { FORGE_TIER: 'medium' } });

    expect(output.continue).toBe(true);
    expect(output.hookSpecificOutput?.additionalContext).toBeTruthy();
    expect(output.hookSpecificOutput.additionalContext).toContain('api.ts');
  });

  it('blocks writes if typecheck fails and mentions the file', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    mkdirSync(join(tmpDir, '.forge', 'contracts'), { recursive: true });
    writeFileSync(join(tmpDir, '.forge', 'contracts', 'api.ts'), 'export interface API {}');

    // Create a package.json with a failing typecheck script
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      scripts: {
        typecheck: 'echo "Type Error in src/app.ts" >&2 && exit 1'
      }
    }));
    
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.ts'), 'bad code');

    const output = runHook('contract-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts', content: 'bad code' },
    }, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(false);
    expect(output.stopReason).toContain('Type error introduced in src/app.ts');
  });

  it('allows writes if typecheck fails but error is unrelated to the file', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    mkdirSync(join(tmpDir, '.forge', 'contracts'), { recursive: true });
    writeFileSync(join(tmpDir, '.forge', 'contracts', 'api.ts'), 'export interface API {}');

    // Create a package.json with a failing typecheck script that doesn't mention src/app.ts
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      scripts: {
        typecheck: 'echo "Type Error in src/other.ts" >&2 && exit 1'
      }
    }));
    
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.ts'), 'good code');

    const output = runHook('contract-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts', content: 'good code' },
    }, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
  });
});
