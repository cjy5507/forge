// @ts-nocheck
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { writeRuntimeState } from './lib/forge-session.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const TEMP_DIRS = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-hook-runtime-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function writeState(cwd, overrides = {}) {
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

function runHook(scriptName, hookCwd, payload = {}, options = {}) {
  const scriptPath = join(FORGE_ROOT, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: hookCwd,
    input: JSON.stringify({ cwd: hookCwd, ...payload }),
    encoding: 'utf8',
    env: {
      ...process.env,
      FORGE_TIER: 'medium',
      ...(options.env || {}),
    },
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readRuntime(rootCwd) {
  return JSON.parse(readFileSync(join(rootCwd, '.forge', 'runtime.json'), 'utf8'));
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop(), { recursive: true, force: true });
  }
});

describe('forge runtime hook integration', () => {
  it('attaches subagent start/stop events to the matching lane when run from a worktree', () => {
    const root = makeWorkspace();
    const worktreeCwd = join(root, '.forge', 'worktrees', 'api');
    mkdirSync(worktreeCwd, { recursive: true });
    writeState(root);
    writeRuntimeState(root, {
      lanes: {
        api: {
          id: 'api',
          title: 'API lane',
          status: 'ready',
          owner_role: 'developer',
          worktree_path: worktreeCwd,
        },
      },
    });

    const start = runHook('subagent-start.mjs', worktreeCwd, {
      agent_id: 'agent-api',
      agent_type: 'executor',
    });
    expect(start.status).toBe(0);

    let runtime = readRuntime(root);
    expect(runtime.active_agents['agent-api'].lane_id).toBe('api');
    expect(runtime.lanes.api.owner_agent_id).toBe('agent-api');
    expect(runtime.lanes.api.status).toBe('in_progress');

    const stop = runHook('subagent-stop.mjs', worktreeCwd, {
      agent_id: 'agent-api',
      agent_type: 'executor',
      last_assistant_message: 'Implemented runtime transitions and tests are green.',
    });
    expect(stop.status).toBe(0);

    runtime = readRuntime(root);
    expect(runtime.active_agents['agent-api']).toBeUndefined();
    expect(runtime.lanes.api.handoff_notes.at(-1).kind).toBe('subagent-stop');
    expect(runtime.lanes.api.session_handoff_notes).toContain('tests are green');
  });

  it('infers review approval and merge readiness from subagent stop notes', () => {
    const root = makeWorkspace();
    const worktreeCwd = join(root, '.forge', 'worktrees', 'api');
    mkdirSync(worktreeCwd, { recursive: true });
    writeState(root);
    writeRuntimeState(root, {
      lanes: {
        api: {
          id: 'api',
          title: 'API lane',
          status: 'in_review',
          review_state: 'pending',
          owner_role: 'lead-dev',
          worktree_path: worktreeCwd,
        },
      },
    });

    const stop = runHook('subagent-stop.mjs', worktreeCwd, {
      agent_id: 'agent-review',
      agent_type: 'code-reviewer',
      last_assistant_message: 'LGTM. Approved and ready to merge after smoke checks.',
    });
    expect(stop.status).toBe(0);

    const runtime = readRuntime(root);
    expect(runtime.lanes.api.review_state).toBe('approved');
    expect(runtime.lanes.api.merge_state).toBe('ready');
    expect(runtime.next_action.summary).toContain('Merge lane api');
  });

  it('infers review changes and rebase work from subagent stop notes', () => {
    const root = makeWorkspace();
    const worktreeCwd = join(root, '.forge', 'worktrees', 'api');
    mkdirSync(worktreeCwd, { recursive: true });
    writeState(root);
    writeRuntimeState(root, {
      lanes: {
        api: {
          id: 'api',
          title: 'API lane',
          status: 'in_review',
          review_state: 'pending',
          owner_role: 'lead-dev',
          worktree_path: worktreeCwd,
        },
      },
    });

    const stop = runHook('subagent-stop.mjs', worktreeCwd, {
      agent_id: 'agent-review',
      agent_type: 'code-reviewer',
      last_assistant_message: 'Changes requested. Main moved, so this lane needs rebase before re-review.',
    });
    expect(stop.status).toBe(0);

    const runtime = readRuntime(root);
    expect(runtime.lanes.api.review_state).toBe('changes_requested');
    expect(runtime.lanes.api.merge_state).toBe('rebasing');
    expect(runtime.next_action.summary).toContain('Rebase lane api');
  });

  it('records lane-specific failure context for git and review style failures', () => {
    const root = makeWorkspace();
    const worktreeCwd = join(root, '.forge', 'worktrees', 'api');
    mkdirSync(worktreeCwd, { recursive: true });
    writeState(root);
    writeRuntimeState(root, {
      lanes: {
        api: {
          id: 'api',
          title: 'API lane',
          status: 'in_review',
          review_state: 'pending',
          worktree_path: worktreeCwd,
        },
      },
    });

    const failure = runHook('tool-failure.mjs', worktreeCwd, {
      tool_name: 'Bash',
      tool_input: { command: 'git rebase main' },
      error: 'CONFLICT (content): Merge conflict in scripts/lib/forge-state.mjs',
    });
    expect(failure.status).toBe(0);

    const runtime = readRuntime(root);
    expect(runtime.recent_failures[0].lane_id).toBe('api');
    expect(runtime.lanes.api.status).toBe('blocked');
    expect(runtime.lanes.api.blocked_reason).toContain('Merge conflict');
  });

  it('blocks the matching lane for review-style failures when lane context exists', () => {
    const root = makeWorkspace();
    const worktreeCwd = join(root, '.forge', 'worktrees', 'api');
    mkdirSync(worktreeCwd, { recursive: true });
    writeState(root);
    writeRuntimeState(root, {
      lanes: {
        api: {
          id: 'api',
          title: 'API lane',
          status: 'in_review',
          review_state: 'pending',
          worktree_path: worktreeCwd,
        },
      },
    });

    const failure = runHook('tool-failure.mjs', worktreeCwd, {
      tool_name: 'Bash',
      tool_input: { command: 'gh pr review --request-changes' },
      error: 'Changes requested: add regression coverage for lane runtime',
    });
    expect(failure.status).toBe(0);

    const runtime = readRuntime(root);
    expect(runtime.recent_failures[0].lane_id).toBe('api');
    expect(runtime.lanes.api.status).toBe('blocked');
    expect(runtime.lanes.api.blocked_reason).toContain('Changes requested');
  });

  it('keeps lightweight behavior when no lane context exists', () => {
    const root = makeWorkspace();
    writeState(root);

    const failure = runHook('tool-failure.mjs', root, {
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      error: 'Command failed',
    });
    expect(failure.status).toBe(0);

    const runtime = readRuntime(root);
    expect(runtime.recent_failures[0].lane_id || '').toBe('');
  });
});
