import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import {
  appendCostSample,
  buildForgeAnalyticsReport,
  readCostSamples,
  renderForgeAnalyticsText,
  summarizeCost,
} from './lib/forge-metrics.mjs';
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

// ── FR-2 regression: producer writes a readable sample ───────────────────
describe('FR-2 cost sample producer', () => {
  it('appendCostSample writes and readCostSamples round-trips', () => {
    const cwd = makeWorkspace();
    mkdirSync(join(cwd, '.forge', 'cost'), { recursive: true });

    appendCostSample(cwd, {
      phase_id: 'develop',
      tier: 'medium',
      duration_ms: 12000,
      estimated_units: 200,
      source: 'estimate',
    });

    const samples = readCostSamples(cwd);
    expect(samples.length).toBe(1);
    expect(samples[0].estimated_units).toBe(200);
    expect(samples[0].source).toBe('estimate');

    const summary = summarizeCost(samples);
    expect(summary.sample_count).toBe(1);
    expect(summary.total_estimated_units).toBe(200);
    expect(summary.by_tier.medium).toBe(200);
  });

  it('appendCostSample surfaces I/O failure via errors.log (no silent catch)', () => {
    const cwd = makeWorkspace();
    // Block cost directory creation by placing a regular file at the path
    // where costDir() wants to mkdir. The caller must not throw (cost is
    // non-fatal), but the error must land in .forge/errors.log so R2 is met.
    writeFileSync(join(cwd, '.forge', 'cost'), 'blocker', 'utf8');

    expect(() => appendCostSample(cwd, {
      phase_id: 'develop',
      tier: 'medium',
      duration_ms: 1000,
      estimated_units: 10,
      source: 'estimate',
    })).not.toThrow();

    const logPath = join(cwd, '.forge', 'errors.log');
    expect(existsSync(logPath)).toBe(true);
    const contents = readFileSync(logPath, 'utf8');
    expect(contents).toContain('forge-metrics:append-cost-sample');
  });
});

// ── FR-3 regression: tier comparison consumer ────────────────────────────
describe('FR-3 tier comparison renderer', () => {
  function withMinimalProject(cwd: string, activeTier: string) {
    writeForgeState(cwd, {
      project: 'tier-compare',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      active_tier: activeTier,
      lanes: {},
    });
  }

  it('renders insufficient data when fewer than 3 prior sessions exist', () => {
    const cwd = makeWorkspace();
    withMinimalProject(cwd, 'medium');
    mkdirSync(join(cwd, '.forge', 'cost'), { recursive: true });
    // Only one history file — below threshold.
    writeFileSync(join(cwd, '.forge', 'cost', 'session-1.json'), JSON.stringify({
      finalized_at: new Date().toISOString(),
      sample_count: 1,
      summary: {
        sample_count: 1,
        total_estimated_units: 120,
        by_tier: { medium: 120 },
        by_phase: { develop: 120 },
      },
    }));

    const report = buildForgeAnalyticsReport(cwd);
    const text = renderForgeAnalyticsText(report);
    expect(text).toContain('Tier comparison: insufficient data');
  });

  it('renders tier averages when history has ≥3 qualifying sessions', () => {
    const cwd = makeWorkspace();
    withMinimalProject(cwd, 'medium');
    const dir = join(cwd, '.forge', 'cost');
    mkdirSync(dir, { recursive: true });

    // Three qualifying sessions. Include a fourth empty session to prove the
    // summary.sample_count filter excludes pre-migration shells.
    const sessions = [
      { units: 120, tier: 'medium' },
      { units: 200, tier: 'medium' },
      { units: 80, tier: 'light' },
    ];
    sessions.forEach((s, i) => {
      writeFileSync(join(dir, `session-${i + 10}.json`), JSON.stringify({
        finalized_at: new Date().toISOString(),
        sample_count: 1,
        summary: {
          sample_count: 1,
          total_estimated_units: s.units,
          by_tier: { [s.tier]: s.units },
          by_phase: { develop: s.units },
        },
      }));
    });
    // Empty-shell session — must be filtered out.
    writeFileSync(join(dir, 'session-9999.json'), JSON.stringify({
      finalized_at: new Date().toISOString(),
      sample_count: 0,
      summary: { sample_count: 0, total_estimated_units: 0, by_tier: {}, by_phase: {} },
    }));

    const report = buildForgeAnalyticsReport(cwd);
    expect(report.tier_comparison.session_count).toBe(3);
    expect(report.tier_comparison.averages.medium).toBe(160); // (120+200)/2
    expect(report.tier_comparison.averages.light).toBe(80);

    const text = renderForgeAnalyticsText(report);
    expect(text).toContain('Tier comparison (current: medium)');
    expect(text).toContain('medium: 160u avg');
    expect(text).toContain('light: 80u avg');
  });
});
