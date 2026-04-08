import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { updateHudLine } from './lib/forge-hud.mjs';

const TEMP_DIRS: string[] = [];
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'forge-hud-home-'));
  TEMP_DIRS.push(home);
  mkdirSync(join(home, '.claude', 'plugins', 'claude-hud'), { recursive: true });
  process.env.HOME = home;
  delete process.env.USERPROFILE;
  return home;
}

function readHudConfig(home: string) {
  return JSON.parse(readFileSync(join(home, '.claude', 'plugins', 'claude-hud', 'config.json'), 'utf8'));
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

describe('forge HUD integration', () => {
  it('writes the minimal stale indicator for stale projects', () => {
    const home = makeHome();

    updateHudLine({ phase: 'develop', mode: 'build' }, { lanes: {} }, 'stale');

    expect(readHudConfig(home).display.customLine).toBe('forge:stale');
  });

  it('renders dynamic lane, blocker, and next-action details', () => {
    const home = makeHome();
    writeFileSync(
      join(home, '.claude', 'plugins', 'claude-hud', 'config.json'),
      JSON.stringify({ display: { customLine: 'old line' } }, null, 2),
    );

    updateHudLine(
      { phase: 'develop', mode: 'build', spec_approved: true, design_approved: true },
      {
        active_agents: {
          agent1: { status: 'running', type: 'forge:developer' },
          agent2: { status: 'done', type: 'forge:qa' },
        },
        lanes: {
          api: { id: 'api', status: 'ready' },
          docs: { id: 'docs', status: 'merged' },
        },
        customer_blockers: [{ summary: 'Need billing answer' }],
        internal_blockers: [{ summary: 'Need QA rerun' }],
        next_action: { skill: 'continue', target: 'api' },
      },
    );

    const line = readHudConfig(home).display.customLine;
    expect(line).toContain('forge:develop');
    expect(line).toContain('developer');
    expect(line).toContain('1/2l');
    expect(line).toContain('next:continue(api)');
    expect(line).toContain('2 blocker');
    expect(line.length).toBeLessThanOrEqual(80);
  });
});
