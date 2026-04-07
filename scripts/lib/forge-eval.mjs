import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readForgeState, readRuntimeState } from './forge-session.mjs';
import { buildStatusModel } from './forge-status.mjs';
import { readTraceabilitySnapshot, summarizeTraceability } from './forge-traceability.mjs';
import { readHoleSummaries, scopeHoleSummariesToProject, summarizeHoles } from './forge-delivery-report.mjs';

const METRIC_DEFS = [
  { key: 'completion', label: 'Completion', direction: 'higher' },
  { key: 'firstPassSuccess', label: 'First-pass success', direction: 'higher' },
  { key: 'retryCount', label: 'Retry count', direction: 'lower' },
  { key: 'testsPassed', label: 'Tests passed', direction: 'higher' },
  { key: 'regressions', label: 'Regressions', direction: 'lower' },
  { key: 'outputConsistency', label: 'Output consistency', direction: 'higher' },
  { key: 'userCorrections', label: 'User corrections', direction: 'lower' },
];

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeMetricRecord(metrics = {}) {
  return Object.fromEntries(METRIC_DEFS.map(({ key }) => [key, safeNumber(Number(metrics?.[key]))]));
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean).map(item => String(item).trim()).filter(Boolean))];
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'eval';
}

function formatMetricValue(value) {
  return value == null ? '' : String(value);
}

function metricDelta(metric, baselineValue, harnessValue) {
  if (baselineValue == null || harnessValue == null) {
    return null;
  }
  const delta = harnessValue - baselineValue;
  if (metric.direction === 'lower') {
    return -delta;
  }
  return delta;
}

export function normalizeRunSummary(input = {}, fallbackLabel = 'run') {
  return {
    label: String(input.label || fallbackLabel),
    task: String(input.task || '').trim(),
    summary: String(input.summary || '').trim(),
    notes: unique(input.notes || []),
    evidenceRefs: unique(input.evidenceRefs || []),
    metrics: normalizeMetricRecord(input.metrics || {}),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
}

export function deriveHarnessRun(cwd = '.', seed = {}) {
  const state = readForgeState(cwd) || {};
  const runtime = readRuntimeState(cwd) || {};
  const statusModel = buildStatusModel({ cwd });
  const traceability = summarizeTraceability(readTraceabilitySnapshot(cwd));
  const holes = summarizeHoles(scopeHoleSummariesToProject(readHoleSummaries(cwd), state));

  const runtimeStats = runtime?.stats && typeof runtime.stats === 'object' ? runtime.stats : {};
  const stateStats = state?.stats && typeof state.stats === 'object' ? state.stats : {};
  const stats = { ...stateStats, ...runtimeStats };

  const retryCount = Number(stats.failure_count || 0) + Number(stats.rollback_count || 0);
  const testsPassed = Math.max(0, Number(stats.test_runs || 0) - Number(stats.test_failures || 0));
  const regressions = holes.blockerCount + holes.majorCount;
  const userCorrections = Number(stats.stop_block_count || 0) + (runtime.customer_blockers?.length || 0);
  const completion = statusModel?.progress_percent ?? traceability.coveragePercent ?? 0;
  const outputConsistency = statusModel?.next_action?.summary
    ? (runtime.internal_blockers?.length || runtime.customer_blockers?.length ? 60 : 100)
    : 40;
  const firstPassSuccess = completion === 100 && retryCount === 0 && regressions === 0 ? 100 : 0;

  const summary = seed.summary || [
    statusModel ? `${statusModel.phase_name} ${statusModel.progress_percent}%` : 'No active Forge status',
    statusModel?.support_summary || '',
  ].filter(Boolean).join(' — ');

  const notes = unique([
    ...(seed.notes || []),
    traceability.total > 0 ? `Traceability coverage ${traceability.coveragePercent}% (${traceability.completedCount}/${traceability.total})` : '',
    holes.blockerCount || holes.majorCount || holes.minorCount
      ? `Open issues ${holes.blockerCount} blocker / ${holes.majorCount} major / ${holes.minorCount} minor`
      : 'No open tracked holes for the active Forge project',
  ]);

  const evidenceRefs = unique([
    ...(seed.evidenceRefs || []),
    '.forge/state.json',
    '.forge/runtime.json',
    'scripts/forge-status.mjs',
    traceability.total > 0 ? '.forge/traceability.json' : '',
    existsSync(join(cwd, '.forge', 'delivery-report', 'report.md')) ? '.forge/delivery-report/report.md' : '',
    existsSync(join(cwd, '.forge', 'evidence', '20260406-codex-live-smoke.md')) ? '.forge/evidence/20260406-codex-live-smoke.md' : '',
  ]);

  return normalizeRunSummary({
    label: seed.label || 'with_forge',
    task: seed.task || state.project || '',
    summary,
    notes,
    evidenceRefs,
    metrics: {
      completion,
      firstPassSuccess,
      retryCount,
      testsPassed,
      regressions,
      outputConsistency,
      userCorrections,
    },
    metadata: {
      project: state.project || '',
      phase: state.phase_id || '',
      deliveryReadiness: runtime.delivery_readiness || '',
      nextAction: statusModel?.next_action?.summary || '',
    },
  });
}

export function compareEvalRuns({ task = '', baseline = null, harness }) {
  const normalizedBaseline = baseline ? normalizeRunSummary(baseline, 'without_forge') : normalizeRunSummary({}, 'without_forge');
  const normalizedHarness = normalizeRunSummary(harness, 'with_forge');
  const metrics = METRIC_DEFS.map((metric) => {
    const baselineValue = normalizedBaseline.metrics[metric.key];
    const harnessValue = normalizedHarness.metrics[metric.key];
    const score = metricDelta(metric, baselineValue, harnessValue);

    let outcome = 'unknown';
    if (score != null) {
      if (score > 0) outcome = 'better';
      else if (score < 0) outcome = 'worse';
      else outcome = 'same';
    }

    return {
      key: metric.key,
      label: metric.label,
      direction: metric.direction,
      baseline: baselineValue,
      harness: harnessValue,
      delta: baselineValue != null && harnessValue != null ? harnessValue - baselineValue : null,
      outcome,
    };
  });

  const betterCount = metrics.filter(metric => metric.outcome === 'better').length;
  const worseCount = metrics.filter(metric => metric.outcome === 'worse').length;
  const hasComparableBaseline = metrics.some(metric => metric.baseline != null && metric.harness != null);

  let decision = 'collect-baseline';
  let summary = 'Baseline metrics are missing; capture a without-Forge run before making strong product claims.';
  const reasons = [];

  if (hasComparableBaseline) {
    if (betterCount > worseCount && normalizedHarness.metrics.completion >= (normalizedBaseline.metrics.completion ?? 0)) {
      decision = 'adopt';
      summary = 'Harness run improved more metrics than it regressed while preserving completion.';
    } else if (worseCount > betterCount) {
      decision = 'revise';
      summary = 'Harness run regressed more metrics than it improved; tighten the workflow before claiming value.';
    } else {
      decision = 'needs-more-data';
      summary = 'Metric deltas are mixed or flat; gather more runs before changing product claims.';
    }
  }

  if (!hasComparableBaseline) {
    reasons.push('No comparable baseline metrics were supplied.');
  }
  if (normalizedHarness.metrics.completion != null) {
    reasons.push(`Harness completion: ${normalizedHarness.metrics.completion}%`);
  }
  if (normalizedHarness.metrics.retryCount != null) {
    reasons.push(`Harness retry count: ${normalizedHarness.metrics.retryCount}`);
  }
  if (normalizedHarness.metrics.regressions != null) {
    reasons.push(`Harness regressions: ${normalizedHarness.metrics.regressions}`);
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    task: String(task || normalizedHarness.task || normalizedBaseline.task || '').trim(),
    baseline: normalizedBaseline,
    harness: normalizedHarness,
    metrics,
    recommendation: {
      decision,
      summary,
      reasons,
      betterCount,
      worseCount,
    },
  };
}

export function renderEvalMarkdown(report) {
  const lines = [
    `# Harness A/B Evaluation: ${report.task || 'unnamed-task'}`,
    '',
    `> Date: ${report.generatedAt.slice(0, 10)}`,
    `> Baseline: ${report.baseline.label}`,
    `> Variant: ${report.harness.label}`,
    '',
    '---',
    '',
    '## Task',
    '',
    report.task || report.harness.summary || report.baseline.summary || 'No task description supplied.',
    '',
    '## Metrics',
    '',
    '| Metric | Baseline | With Forge | Delta |',
    '|--------|----------|------------|-------|',
    ...report.metrics.map(metric => `| ${metric.label} | ${formatMetricValue(metric.baseline)} | ${formatMetricValue(metric.harness)} | ${formatMetricValue(metric.delta)} |`),
    '',
    '## Baseline Summary',
    '',
    report.baseline.summary || 'No baseline summary supplied.',
    '',
    '## Harness Summary',
    '',
    report.harness.summary || 'No harness summary supplied.',
    '',
    '## Qualitative Notes',
    '',
    ...unique([...report.baseline.notes, ...report.harness.notes]).map(note => `- ${note}`),
    '',
    '## Recommendation',
    '',
    `${report.recommendation.decision}: ${report.recommendation.summary}`,
  ];

  if (report.harness.evidenceRefs.length > 0) {
    lines.push('', '## Evidence', '', ...report.harness.evidenceRefs.map(ref => `- ${ref}`));
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

export function writeEvalArtifacts(cwd = '.', report, options = {}) {
  const slug = slugify(options.slug || report.task || report.harness.task || 'eval');
  const evalDir = join(cwd, '.forge', 'eval');
  const eventsDir = join(cwd, '.forge', 'events');
  mkdirSync(evalDir, { recursive: true });
  mkdirSync(eventsDir, { recursive: true });

  const jsonPath = join(evalDir, `${slug}.json`);
  const markdownPath = join(evalDir, `${slug}.md`);
  const markdown = renderEvalMarkdown(report);

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, markdown);

  appendFileSync(join(eventsDir, 'eval.jsonl'), `${JSON.stringify({
    type: 'forge-eval',
    task: report.task,
    generatedAt: report.generatedAt,
    decision: report.recommendation.decision,
    jsonPath: `.forge/eval/${slug}.json`,
    markdownPath: `.forge/eval/${slug}.md`,
  })}\n`);

  return {
    slug,
    jsonPath,
    markdownPath,
    markdown,
  };
}

export function loadRunSummary(path, fallbackLabel) {
  const parsed = safeReadJson(path);
  if (!parsed) {
    throw new Error(`Invalid JSON summary: ${path}`);
  }
  return normalizeRunSummary(parsed, fallbackLabel);
}
