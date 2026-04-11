import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const TEMP_DIRS: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-root-hooks-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function writeState(cwd: string, overrides = {}) {
  writeFileSync(join(cwd, '.forge', 'state.json'), `${JSON.stringify({
    version: '0.1.0',
    project: 'test-project',
    phase: 'develop',
    phase_id: 'develop',
    phase_index: 4,
    phase_name: 'develop',
    mode: 'build',
    status: 'active',
    created_at: '',
    updated_at: '',
    agents_active: [],
    spec_approved: true,
    design_approved: true,
    tasks: [],
    holes: [],
    pr_queue: [],
    ...overrides,
  }, null, 2)}\n`);
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe('repository-root hooks surface', () => {
  it('publishes a Claude hook lifecycle map that resolves through CLAUDE_PLUGIN_ROOT', () => {
    const config = JSON.parse(readFileSync(join(FORGE_ROOT, 'hooks', 'hooks.json'), 'utf8'));
    const commands = Object.values(config.hooks)
      .flat()
      .flatMap((entry: any) => entry.hooks.map((hook: any) => hook.command));

    expect(config.hooks.SessionStart).toBeDefined();
    expect(config.hooks.SessionEnd).toBeDefined();
    expect(config.hooks.PreToolUse).toBeDefined();
    expect(config.hooks.PostToolUse).toBeDefined();
    expect(config.hooks.Stop).toBeDefined();

    for (const command of commands) {
      expect(command).toContain('${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.mjs');
      expect(command).not.toContain('./hooks/run-hook.mjs');
    }
  });

  it('forwards hook payloads through the host-neutral wrapper', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'hooks', 'run-hook.mjs'), 'state-restore'], {
      cwd,
      input: JSON.stringify({ cwd }),
      encoding: 'utf8',
      env: {
        ...process.env,
        FORGE_TIER: 'medium',
      },
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout || '{}');
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
  });

  it('skips hooks that are disabled by environment controls', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'hooks', 'run-hook.mjs'), 'state-restore'], {
      cwd,
      input: JSON.stringify({ cwd }),
      encoding: 'utf8',
      env: {
        ...process.env,
        FORGE_DISABLED_HOOKS: 'state-restore',
      },
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout || '{}');
    expect(output.hookSkipped).toBe(true);
    expect(output.hookName).toBe('state-restore');
  });

  it('skips strict hooks when the active profile is minimal', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'hooks', 'run-hook.mjs'), 'context-manager'], {
      cwd,
      input: JSON.stringify({ cwd }),
      encoding: 'utf8',
      env: {
        ...process.env,
        FORGE_HOOK_PROFILE: 'minimal',
      },
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout || '{}');
    expect(output.hookSkipped).toBe(true);
    expect(output.activeProfile).toBe('minimal');
  });

  it('ships the wrapper alongside hooks.json', () => {
    expect(existsSync(join(FORGE_ROOT, 'hooks', 'run-hook.mjs'))).toBe(true);
  });

  it('uses expanded timeout budgets for write-heavy Claude hooks', () => {
    const config = JSON.parse(readFileSync(join(FORGE_ROOT, 'hooks', 'hooks.json'), 'utf8'));
    // PreToolUse Write|Edit gate gets expanded timeout
    expect(config.hooks.PreToolUse[0].hooks[0].timeout).toBe(8);
    // PostToolUse Write|Edit guards (contract-guard, code-rules-guard) get expanded timeout
    const writeEditGroup = config.hooks.PostToolUse.find((g: { matcher: string }) => g.matcher === 'Write|Edit');
    expect(writeEditGroup.hooks[0].timeout).toBe(8);
    expect(writeEditGroup.hooks[1].timeout).toBe(8);
    // Stop guard gets expanded timeout — 30s is required so batch lint/typecheck
    // checks fit within the host budget; the inner spawn cap (run-hook.mjs) and
    // per-check cap (forge-tooling.mjs) keep the actual work bounded.
    expect(config.hooks.Stop[0].hooks[0].timeout).toBe(30);
  });
});
