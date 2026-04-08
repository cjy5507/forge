import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { writeForgeState, writeRuntimeState } from './lib/forge-session.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const TEMP_DIRS: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-stop-batch-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function runHook(scriptName: string, cwd: string, payload = {}, env = {}) {
  const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', scriptName)], {
    cwd,
    input: JSON.stringify({ cwd, ...payload }),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });

  return JSON.parse(result.stdout || '{}');
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe('forge stop batch checks', () => {
  it('accumulates edited files and detected commands after edits', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'batch-app',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      mode: 'build',
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
      version: '0.1.0',
      tier: 'full',
      stats: undefined,
      phase_index: 4,
    });
    writeRuntimeState(cwd, {});
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'eslint .',
        typecheck: 'tsc --noEmit',
        test: 'vitest run',
      },
    }));

    const output = runHook('post-edit-accumulator.mjs', cwd, {
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts', content: 'export const x = 1;\n' },
    }, { FORGE_TIER: 'full' });

    expect(output.continue).toBe(true);
    const runtime = JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.tooling.edited_files).toContain('src/app.ts');
    expect(runtime.tooling.detected_commands.typecheck).toContain('typecheck');
  });

  it('blocks stop when batch checks fail', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'batch-app',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      mode: 'build',
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
      version: '0.1.0',
      tier: 'full',
      stats: undefined,
      phase_index: 4,
    });
    writeRuntimeState(cwd, {
      tooling: {
        edited_files: ['src/app.ts'],
      },
      lanes: {
        app: {
          id: 'app',
          title: 'App lane',
          status: 'in_progress',
          areas: ['src'],
        },
      },
    });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'echo \"lint failed\" >&2 && exit 1',
      },
    }));

    const output = runHook('stop-guard.mjs', cwd, {
      last_assistant_message: 'Implementation done.',
    }, { FORGE_TIER: 'full' });

    expect(output.decision).toBe('block');
    expect(output.reason).toContain('[Forge Batch Checks]');
    expect(output.reason).toContain('lint failed');
    const runtime = JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.decision_trace.latest.kind).toBe('batch_check_block');
    expect(runtime.verification.status).toBe('failed');
    expect(runtime.verification.lane_refs).toContain('app');
    expect(runtime.verification.selected_checks[0].id).toBe('lint');
    const artifact = JSON.parse(readFileSync(join(cwd, '.forge', 'evidence', 'verification-latest.json'), 'utf8'));
    expect(artifact.status).toBe('failed');
  });

  it('clears edited files when batch checks pass', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'batch-app',
      phase: 'discovery',
      phase_id: 'discovery',
      phase_name: 'discovery',
      mode: 'build',
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
      version: '0.1.0',
      tier: 'medium',
      stats: undefined,
      phase_index: 2,
    });
    writeRuntimeState(cwd, {
      tooling: {
        edited_files: ['src/app.ts'],
      },
      lanes: {
        app: {
          id: 'app',
          title: 'App lane',
          status: 'in_progress',
          areas: ['src'],
        },
      },
    });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'echo lint ok',
      },
    }));

    const output = runHook('stop-guard.mjs', cwd, {
      last_assistant_message: 'Drafted discovery notes.',
    }, { FORGE_TIER: 'medium' });

    expect(output.continue).toBe(true);
    const runtime = JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.tooling.edited_files).toEqual([]);
    expect(runtime.tooling.last_batch_check.status).toBe('passed');
    expect(runtime.decision_trace.latest.kind).toBe('allow_noncritical');
    expect(runtime.verification.status).toBe('passed');
    expect(runtime.verification.lane_refs).toContain('app');
    const artifact = JSON.parse(readFileSync(join(cwd, '.forge', 'evidence', 'verification-latest.json'), 'utf8'));
    expect(artifact.status).toBe('passed');
  });

  it('records failure categories and retry commands in tool-failure', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'batch-app',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      mode: 'build',
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
      version: '0.1.0',
      tier: 'full',
      stats: undefined,
      phase_index: 4,
    });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'eslint .',
      },
    }));

    const output = runHook('tool-failure.mjs', cwd, {
      tool_name: 'Bash',
      tool_input: { command: 'npm run lint' },
      error: 'Lint failed',
    }, { FORGE_TIER: 'full' });

    expect(output.hookSpecificOutput.additionalContext).toContain('Retry:');
    const runtime = JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.recent_failures[0].category).toBe('lint');
    expect(runtime.recent_failures[0].suggested_command).toContain('run lint');
    expect(runtime.decision_trace.latest.kind).toBe('failure_lint');
    expect(runtime.recovery.latest.category).toBe('lint');
    expect(runtime.recovery.latest.status).toBe('active');
  });

  it('escalates repeated recovery failures after the retry limit', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'batch-app',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      mode: 'build',
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
      version: '0.1.0',
      tier: 'full',
      stats: undefined,
      phase_index: 4,
    });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'eslint .',
      },
    }));

    for (let index = 0; index < 3; index += 1) {
      runHook('tool-failure.mjs', cwd, {
        tool_name: 'Bash',
        tool_input: { command: 'npm run lint' },
        error: 'Lint failed',
      }, { FORGE_TIER: 'full' });
    }

    const runtime = JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.recovery.latest.retry_count).toBe(3);
    expect(runtime.recovery.latest.status).toBe('escalated');
  });
});
