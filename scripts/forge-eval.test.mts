import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

import {
  compareEvalRuns,
  deriveHarnessRun,
  getEvalScenario,
  listEvalScenarios,
  normalizeRunSummary,
  renderEvalMarkdown,
  writeEvalArtifacts,
} from './lib/forge-eval.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-eval-'));
  mkdirSync(join(cwd, '.forge', 'holes'), { recursive: true });
  mkdirSync(join(cwd, '.forge', 'delivery-report'), { recursive: true });
  return cwd;
}

describe('forge eval', () => {
  const workspaces = [];

  afterEach(() => {
    for (const cwd of workspaces.splice(0, workspaces.length)) {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('derives a harness summary from current Forge artifacts', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify({
      project: 'eval-demo',
      phase_id: 'complete',
      mode: 'build',
      tier: 'medium',
      created_at: '2026-04-06T00:00:00.000Z',
      stats: {
        failure_count: 1,
        rollback_count: 0,
        stop_block_count: 2,
        test_runs: 6,
        test_failures: 1,
      },
    }, null, 2));
    writeFileSync(join(cwd, '.forge', 'runtime.json'), JSON.stringify({
      delivery_readiness: 'delivered',
      stats: {
        failure_count: 1,
        rollback_count: 0,
        stop_block_count: 2,
        test_runs: 6,
        test_failures: 1,
      },
      next_action: {
        summary: 'Project delivered',
      },
      lanes: {},
      customer_blockers: [],
      internal_blockers: [],
    }, null, 2));
    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-06T00:00:00.000Z',
      requirements: [
        { id: 'FR-1', title: 'Ship Forge eval', status: 'verified', acceptanceCriteria: [] },
      ],
    }, null, 2));
    writeFileSync(join(cwd, '.forge', 'delivery-report', 'report.md'), '# Delivery');
    const oldHolePath = join(cwd, '.forge', 'holes', 'HOLE-OLD.md');
    writeFileSync(oldHolePath, '# Old\n\n**Severity:** blocker\n**Status:** open\n');
    utimesSync(oldHolePath, new Date('2026-04-05T00:00:00.000Z'), new Date('2026-04-05T00:00:00.000Z'));

    const run = deriveHarnessRun(cwd, { task: 'codex smoke' });

    expect(run.task).toBe('codex smoke');
    expect(run.metrics.completion).toBe(100);
    expect(run.metrics.retryCount).toBe(1);
    expect(run.metrics.testsPassed).toBe(5);
    expect(run.metrics.regressions).toBe(0);
    expect(run.metrics.userCorrections).toBe(2);
    expect(run.evidenceRefs).toContain('.forge/state.json');
    expect(run.evidenceRefs).toContain('.forge/delivery-report/report.md');
  });

  it('applies built-in scenario notes and evidence refs to derived harness runs', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify({
      project: 'eval-scenario',
      phase_id: 'develop',
      mode: 'build',
      tier: 'full',
      stats: {
        failure_count: 0,
        rollback_count: 0,
        stop_block_count: 0,
        test_runs: 3,
        test_failures: 0,
      },
    }, null, 2));
    writeFileSync(join(cwd, '.forge', 'runtime.json'), JSON.stringify({
      delivery_readiness: 'in_progress',
      next_action: {
        summary: 'Finish lane phase-gate-enforcement',
      },
      stats: {
        failure_count: 0,
        rollback_count: 0,
        stop_block_count: 0,
        test_runs: 3,
        test_failures: 0,
      },
      lanes: {},
      customer_blockers: [],
      internal_blockers: [],
    }, null, 2));

    const run = deriveHarnessRun(cwd, { scenario: 'phase-gate-enforcement' });

    expect(run.summary).toContain('Phase Gate Enforcement');
    expect(run.notes.some(note => note.includes('missing-artifact'))).toBe(true);
    expect(run.evidenceRefs).toContain('scripts/lib/forge-state-store.mjs');
    expect(run.metadata.scenario).toBe('phase-gate-enforcement');
  });

  it('compares baseline and harness metrics with a recommendation', () => {
    const report = compareEvalRuns({
      task: 'compare',
      baseline: normalizeRunSummary({
        label: 'without_forge',
        metrics: {
          completion: 60,
          firstPassSuccess: 0,
          retryCount: 3,
          testsPassed: 2,
          regressions: 2,
          outputConsistency: 50,
          userCorrections: 4,
        },
      }),
      harness: normalizeRunSummary({
        label: 'with_forge',
        metrics: {
          completion: 100,
          firstPassSuccess: 100,
          retryCount: 1,
          testsPassed: 5,
          regressions: 0,
          outputConsistency: 100,
          userCorrections: 1,
        },
      }),
    });

    expect(report.recommendation.decision).toBe('adopt');
    expect(report.metrics.find(metric => metric.key === 'completion')?.outcome).toBe('better');
    expect(renderEvalMarkdown(report)).toContain('# Harness A/B Evaluation: compare');
  });

  it('writes eval artifacts and event logs from the CLI', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify({
      project: 'cli-eval',
      phase_id: 'complete',
      mode: 'build',
      tier: 'medium',
      stats: {
        failure_count: 0,
        rollback_count: 0,
        stop_block_count: 0,
        test_runs: 2,
        test_failures: 0,
      },
    }, null, 2));
    writeFileSync(join(cwd, '.forge', 'runtime.json'), JSON.stringify({
      delivery_readiness: 'delivered',
      stats: {
        failure_count: 0,
        rollback_count: 0,
        stop_block_count: 0,
        test_runs: 2,
        test_failures: 0,
      },
      next_action: {
        summary: 'Project delivered',
      },
      lanes: {},
      customer_blockers: [],
      internal_blockers: [],
    }, null, 2));

    const baselinePath = join(cwd, 'baseline.json');
    writeFileSync(baselinePath, JSON.stringify({
      label: 'without_forge',
      task: 'cli-eval',
      summary: 'baseline run',
      metrics: {
        completion: 50,
        firstPassSuccess: 0,
        retryCount: 2,
        testsPassed: 1,
        regressions: 1,
        outputConsistency: 50,
        userCorrections: 3,
      },
    }, null, 2));

    const result = spawnSync(process.execPath, [
      join(FORGE_ROOT, 'scripts', 'forge-eval.mjs'),
      '--task', 'cli-eval',
      '--baseline', baselinePath,
      '--write',
    ], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split('\n');
    expect(lines[0]).toContain('.forge/eval/cli-eval.json');
    expect(lines[1]).toContain('.forge/eval/cli-eval.md');
    expect(existsSync(join(cwd, '.forge', 'events', 'eval.jsonl'))).toBe(true);

    const json = JSON.parse(readFileSync(join(cwd, '.forge', 'eval', 'cli-eval.json'), 'utf8'));
    expect(json.recommendation.decision).toBe('adopt');
  });

  it('writes eval artifacts from the library', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    const report = compareEvalRuns({
      task: 'lib-eval',
      baseline: normalizeRunSummary({
        metrics: { completion: 0, retryCount: 4, testsPassed: 0, regressions: 3, userCorrections: 5, firstPassSuccess: 0, outputConsistency: 20 },
      }),
      harness: normalizeRunSummary({
        metrics: { completion: 100, retryCount: 0, testsPassed: 7, regressions: 0, userCorrections: 0, firstPassSuccess: 100, outputConsistency: 100 },
      }),
    });

    const outputs = writeEvalArtifacts(cwd, report);
    expect(outputs.jsonPath).toContain('.forge/eval/lib-eval.json');
    expect(readFileSync(outputs.markdownPath, 'utf8')).toContain('## Recommendation');
  });

  it('lists built-in eval scenarios', () => {
    const scenarios = listEvalScenarios();

    expect(scenarios.map(scenario => scenario.id)).toEqual([
      'phase-gate-enforcement',
      'host-degraded-support',
      'trust-warning-surface',
    ]);
    expect(getEvalScenario('host-degraded-support')?.title).toBe('Host Degraded Support');
  });

  it('prints scenario lists and supports scenario-driven cli runs', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify({
      project: 'scenario-cli',
      phase_id: 'develop',
      mode: 'build',
      tier: 'full',
      stats: {
        failure_count: 0,
        rollback_count: 0,
        stop_block_count: 0,
        test_runs: 2,
        test_failures: 0,
      },
    }, null, 2));
    writeFileSync(join(cwd, '.forge', 'runtime.json'), JSON.stringify({
      delivery_readiness: 'in_progress',
      next_action: {
        summary: 'Finish lane host-capability-contract',
      },
      stats: {
        failure_count: 0,
        rollback_count: 0,
        stop_block_count: 0,
        test_runs: 2,
        test_failures: 0,
      },
      lanes: {},
      customer_blockers: [],
      internal_blockers: [],
    }, null, 2));

    const listResult = spawnSync(process.execPath, [
      join(FORGE_ROOT, 'scripts', 'forge-eval.mjs'),
      '--list-scenarios',
    ], {
      cwd,
      encoding: 'utf8',
    });

    expect(listResult.status).toBe(0);
    expect(listResult.stdout).toContain('phase-gate-enforcement');
    expect(listResult.stdout).toContain('host-degraded-support');

    const scenarioResult = spawnSync(process.execPath, [
      join(FORGE_ROOT, 'scripts', 'forge-eval.mjs'),
      '--scenario', 'host-degraded-support',
      '--json',
    ], {
      cwd,
      encoding: 'utf8',
    });

    expect(scenarioResult.status).toBe(0);
    const parsed = JSON.parse(scenarioResult.stdout);
    expect(parsed.task).toBe('Host Degraded Support');
    expect(parsed.harness.metadata.scenario).toBe('host-degraded-support');
    expect(parsed.harness.evidenceRefs).toContain('scripts/lib/forge-host-catalog.mjs');
  });
});
