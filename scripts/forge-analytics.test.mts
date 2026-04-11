import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { buildForgeAnalyticsReport } from './lib/forge-metrics.mjs';
import { recordVerificationState, writeForgeState, writeRuntimeState } from './lib/forge-session.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const WORKSPACES: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-analytics-'));
  WORKSPACES.push(cwd);
  mkdirSync(join(cwd, '.forge', 'events'), { recursive: true });
  mkdirSync(join(cwd, '.forge', 'eval'), { recursive: true });
  mkdirSync(join(cwd, '.forge', 'evidence'), { recursive: true });
  mkdirSync(join(cwd, '.forge', 'delivery-report'), { recursive: true });
  return cwd;
}

afterEach(() => {
  while (WORKSPACES.length > 0) {
    rmSync(WORKSPACES.pop()!, { recursive: true, force: true });
  }
});

describe('forge analytics surface', () => {
  it('summarizes .forge artifacts without mutating runtime state', () => {
    const cwd = makeWorkspace();
    writeForgeState(cwd, {
      project: 'analytics-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      lanes: {
        api: { id: 'api', title: 'API lane', status: 'ready' },
      },
    });
    writeFileSync(join(cwd, '.forge', 'events', 'eval.jsonl'), '{}\n');
    writeFileSync(join(cwd, '.forge', 'eval', 'latest.json'), '{}\n');
    writeFileSync(join(cwd, '.forge', 'eval', 'latest.md'), '# Eval\n');
    writeFileSync(join(cwd, '.forge', 'evidence', 'rca.md'), '# Evidence\n');
    writeFileSync(join(cwd, '.forge', 'delivery-report', 'report.md'), '# Report\n');
    recordVerificationState(cwd, {
      updated_at: new Date().toISOString(),
      edited_files: ['src/app.ts'],
      selected_checks: [{ id: 'lint', reason: 'edited source files', command: 'npm run lint' }],
      status: 'passed',
      summary: 'Passed: lint.',
    });

    const report = buildForgeAnalyticsReport(cwd);
    expect(report.project.name).toBe('analytics-app');
    expect(report.project.lane_count).toBe(1);
    expect(report.artifacts.events.count).toBe(1);
    expect(report.artifacts.eval_json.count).toBe(1);
    expect(report.artifacts.evidence.count).toBe(1);
    expect(report.artifacts.verification.exists).toBe(true);
    expect(report.artifacts.verification.status).toBe('passed');
  });

  it('prints structured json from the CLI', () => {
    const cwd = makeWorkspace();
    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-analytics.mjs'), '--json'], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.artifacts).toBeDefined();
  });
});
