import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupForgeBranches, cleanupSessionArtifacts, clearHudCustomLine, compactRuntimeState } from './lib/session-cleanup.mjs';

const TEMP_DIRS: string[] = [];
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-cleanup-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function initGitWorkspace(cwd: string) {
  expect(spawnSync('git', ['init'], { cwd, encoding: 'utf8' }).status).toBe(0);
  expect(spawnSync('git', ['config', 'user.name', 'Forge Test'], { cwd, encoding: 'utf8' }).status).toBe(0);
  expect(spawnSync('git', ['config', 'user.email', 'forge@example.com'], { cwd, encoding: 'utf8' }).status).toBe(0);
  writeFileSync(join(cwd, 'README.md'), '# Test Repo\n');
  expect(spawnSync('git', ['add', 'README.md'], { cwd, encoding: 'utf8' }).status).toBe(0);
  expect(spawnSync('git', ['commit', '-m', 'init'], { cwd, encoding: 'utf8' }).status).toBe(0);
}

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'forge-cleanup-home-'));
  TEMP_DIRS.push(home);
  mkdirSync(join(home, '.claude', 'plugins', 'claude-hud'), { recursive: true });
  process.env.HOME = home;
  delete process.env.USERPROFILE;
  return home;
}

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  if (ORIGINAL_USERPROFILE === undefined) {
    delete process.env.USERPROFILE;
  } else {
    process.env.USERPROFILE = ORIGINAL_USERPROFILE;
  }

  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe('session cleanup helpers', () => {
  it('removes session directories and rotates errors.log', () => {
    const cwd = makeWorkspace();
    mkdirSync(join(cwd, '.forge', 'session-artifacts'), { recursive: true });
    mkdirSync(join(cwd, '.forge', 'session-logs'), { recursive: true });
    mkdirSync(join(cwd, '.forge', 'session-state'), { recursive: true });
    writeFileSync(join(cwd, '.forge', 'errors.log'), 'latest error\n');
    writeFileSync(join(cwd, '.forge', 'errors.log.prev'), 'older error\n');

    const removed = cleanupSessionArtifacts(cwd);

    expect(removed).toContain(join(cwd, '.forge', 'session-artifacts'));
    expect(removed).toContain(join(cwd, '.forge', 'session-logs'));
    expect(removed).toContain(join(cwd, '.forge', 'session-state'));
    expect(removed).toContain(join(cwd, '.forge', 'errors.log'));
    expect(existsSync(join(cwd, '.forge', 'session-artifacts'))).toBe(false);
    expect(existsSync(join(cwd, '.forge', 'errors.log'))).toBe(false);
    expect(readFileSync(join(cwd, '.forge', 'errors.log.prev'), 'utf8')).toBe('latest error\n');
  });

  it('clears only the custom HUD line when claude-hud is present', () => {
    const home = makeHome();
    const configPath = join(home, '.claude', 'plugins', 'claude-hud', 'config.json');
    writeFileSync(configPath, JSON.stringify({
      display: { customLine: 'forge:develop 3/8' },
      theme: 'existing',
    }, null, 2));

    clearHudCustomLine();

    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.display.customLine).toBeUndefined();
    expect(parsed.theme).toBe('existing');
  });

  it('deletes forge lane branches only for completed lanes', () => {
    const cwd = makeWorkspace();
    initGitWorkspace(cwd);

    expect(spawnSync('git', ['branch', 'forge/api'], { cwd, encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync('git', ['branch', 'forge/docs'], { cwd, encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync('git', ['branch', 'forge/ui'], { cwd, encoding: 'utf8' }).status).toBe(0);

    const cleaned = cleanupForgeBranches(cwd, {
      lanes: {
        api: { id: 'api', status: 'done' },
        docs: { id: 'docs', status: 'merged' },
        ui: { id: 'ui', status: 'in_progress' },
      },
    });

    expect(cleaned.sort()).toEqual(['forge/api', 'forge/docs']);

    const branches = spawnSync('git', ['branch', '--list', 'forge/*'], {
      cwd,
      encoding: 'utf8',
    }).stdout;
    expect(branches).not.toContain('forge/api');
    expect(branches).not.toContain('forge/docs');
    expect(branches).toContain('forge/ui');
  });

  it('compactRuntimeState evicts terminal lanes beyond retention limit', () => {
    const lanes: Record<string, unknown> = {};
    for (let i = 0; i < 15; i++) {
      lanes[`lane-${i}`] = {
        id: `lane-${i}`,
        status: 'done',
        last_event_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      };
    }
    lanes['active-1'] = { id: 'active-1', status: 'in_progress' };

    const runtime = { lanes, recent_agents: [], recent_failures: [] } as any;
    const result = compactRuntimeState(runtime);

    expect(result.compacted).toBe(true);
    expect(result.evictedLanes).toBe(5);
    // 10 terminal + 1 active = 11 remaining
    expect(Object.keys(runtime.lanes)).toHaveLength(11);
    // Active lane must survive
    expect(runtime.lanes['active-1']).toBeDefined();
    // Oldest lanes (lane-0 through lane-4) should be evicted
    expect(runtime.lanes['lane-0']).toBeUndefined();
    expect(runtime.lanes['lane-4']).toBeUndefined();
    // Newest terminals should survive
    expect(runtime.lanes['lane-14']).toBeDefined();
  });

  it('compactRuntimeState trims recent_agents and recent_failures', () => {
    const runtime = {
      lanes: {},
      recent_agents: Array.from({ length: 30 }, (_, i) => ({ kind: 'test', at: `t${i}` })),
      recent_failures: Array.from({ length: 25 }, (_, i) => ({ tool: 'test', at: `t${i}` })),
    } as any;

    const result = compactRuntimeState(runtime);

    expect(result.compacted).toBe(true);
    expect(result.prunedEntries).toBe(15); // 10 from agents + 5 from failures
    expect(runtime.recent_agents).toHaveLength(20);
    expect(runtime.recent_failures).toHaveLength(20);
  });

  it('compactRuntimeState clears stopped/failed active agents', () => {
    const runtime = {
      lanes: {},
      recent_agents: [],
      recent_failures: [],
      active_agents: {
        'agent-1': { status: 'running' },
        'agent-2': { status: 'stopped' },
        'agent-3': { status: 'failed' },
      },
    } as any;

    const result = compactRuntimeState(runtime);

    expect(result.prunedEntries).toBe(2);
    expect(runtime.active_agents['agent-1']).toBeDefined();
    expect(runtime.active_agents['agent-2']).toBeUndefined();
    expect(runtime.active_agents['agent-3']).toBeUndefined();
  });

  it('compactRuntimeState is safe on null/empty input', () => {
    expect(compactRuntimeState(null as any).compacted).toBe(false);
    expect(compactRuntimeState({} as any).compacted).toBe(false);
    expect(compactRuntimeState({ lanes: {}, recent_agents: [], recent_failures: [] } as any).compacted).toBe(false);
  });
});
