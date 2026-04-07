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

describe('code-rules-guard hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('surfaces code-rules guidance for full-tier high-risk writes', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    writeFileSync(join(tmpDir, '.forge', 'code-rules.md'), '# rules\n');

    const output = runHook('code-rules-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'package.json',
        content: '{"dependencies":{"new-lib":"1.0.0"}}',
      },
    }, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.hookSpecificOutput).toBeDefined();
    expect(output.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(output.hookSpecificOutput.additionalContext).toContain('re-check .forge/code-rules.md');
  });

  it('suppresses output when code-rules are missing', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });

    const output = runHook('code-rules-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'package.json',
        content: '{"dependencies":{"new-lib":"1.0.0"}}',
      },
    }, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toBeUndefined();
  });

  it('suppresses output below full tier', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'medium' });
    writeFileSync(join(tmpDir, '.forge', 'code-rules.md'), '# rules\n');

    const output = runHook('code-rules-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'package.json',
        content: '{"dependencies":{"new-lib":"1.0.0"}}',
      },
    }, { env: { FORGE_TIER: 'medium' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toBeUndefined();
  });

  it('suppresses output for low-risk writes', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    writeFileSync(join(tmpDir, '.forge', 'code-rules.md'), '# rules\n');

    const output = runHook('code-rules-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/utils/format.ts',
        content: 'console.log("hello");',
      },
    }, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toBeUndefined();
  });

  it('blocks high-risk writes if linter fails', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    writeFileSync(join(tmpDir, '.forge', 'code-rules.md'), '# rules\n');
    
    // Create a package.json with a failing lint script
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'echo "Linter Error" >&2 && exit 1'
      }
    }));
    
    // Create the file being checked
    const testFile = join(tmpDir, 'src', 'app.ts');
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(testFile, 'bad code');

    const output = runHook('code-rules-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/app.ts',
        content: 'bad code',
      },
    }, { env: { FORGE_TIER: 'full' } });

    expect(output.continue).toBe(false);
    expect(output.stopReason).toContain('Linter failed for src/app.ts');
    expect(output.stopReason).toContain('Linter Error');
  });
});
