import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupForgeBranches, cleanupSessionArtifacts, clearHudCustomLine } from './lib/session-cleanup.mjs';

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
});
