// Forge metrics — cost tracking + analytics aggregation.
//
// Cost: RELATIVE tier comparison, not absolute billing.
//   1. Probed Stop-hook input (if the host exposes token usage fields)
//   2. Duration × tier-weight estimation (always available, proxy only)
//
// Analytics: aggregate counts of artifacts and cost samples for status/CLI surfaces.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ensureForgeDir, resolveForgeBaseDir } from './forge-io.mjs';
import { readVerificationArtifact } from './forge-verification.mjs';
import { readForgeState, readRuntimeState } from './forge-session.mjs';
import { logHookError } from './error-handler.mjs';

// ── Cost ──────────────────────────────────────────────────────────────────

// Proxy weights. Higher tier → more guardrail/validation work → more tokens.
// These are NOT $/token estimates; they exist only to compare tiers.
const TIER_WEIGHT = { off: 0.5, light: 0.8, medium: 1.0, full: 1.5 };
const UNITS_PER_MINUTE = 1000;

function costDir(cwd) {
  const dir = join(resolveForgeBaseDir(cwd), '.forge', 'cost');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// One-shot discovery: record the top-level keys of a Stop-hook input the
// first time we see one. Lets us learn what the host actually exposes
// without guessing at field names.
export function recordHookInputKeys(cwd, input) {
  try {
    const file = join(costDir(cwd), 'hook-input-keys.json');
    if (existsSync(file)) return;
    const keys = input && typeof input === 'object' ? Object.keys(input).sort() : [];
    writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), keys }, null, 2));
  } catch (error) {
    // Probe write is one-shot diagnostic; surface failures via errors.log
    // instead of swallowing (R2: no silent catch).
    logHookError(error, 'forge-metrics:hook-input-keys', cwd);
  }
}

// Look for token usage fields in common shapes. Returns null if nothing found.
export function probeStopHookUsage(input) {
  if (!input || typeof input !== 'object') return null;
  const candidates = [
    input.usage,
    input.token_usage,
    input.tokens,
    input.metrics?.usage,
    input.session?.usage,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      const input_tokens = Number(c.input_tokens ?? c.prompt_tokens ?? c.input ?? 0) || 0;
      const output_tokens = Number(c.output_tokens ?? c.completion_tokens ?? c.output ?? 0) || 0;
      if (input_tokens || output_tokens) {
        return { input_tokens, output_tokens, source: 'stop-hook-input' };
      }
    }
  }
  return null;
}

export function estimatePhaseCost({ tier = 'medium', durationMs = 0, phaseId = '' } = {}) {
  const weight = TIER_WEIGHT[tier] ?? 1.0;
  const minutes = Math.max(0, Number(durationMs) || 0) / 60000;
  return {
    phase_id: phaseId,
    tier,
    duration_ms: durationMs,
    estimated_units: Math.round(minutes * UNITS_PER_MINUTE * weight),
    source: 'estimate',
  };
}

export function appendCostSample(cwd, sample) {
  try {
    const file = join(costDir(cwd), 'samples.jsonl');
    const line = JSON.stringify({ at: new Date().toISOString(), ...sample }) + '\n';
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    writeFileSync(file, current + line);
  } catch (error) {
    // Cost sampling is non-fatal for the caller (Stop hook must always
    // succeed), but we surface failures via errors.log so real I/O problems
    // (ENOSPC, EACCES, race conditions) can be diagnosed. R2 compliance.
    logHookError(error, 'forge-metrics:append-cost-sample', cwd);
  }
}

export function readCostSamples(cwd) {
  try {
    const file = join(costDir(cwd), 'samples.jsonl');
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

export function summarizeCost(samples) {
  const byTier = {};
  const byPhase = {};
  let totalUnits = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let hasMeasured = false;

  for (const s of samples) {
    const tier = s.tier || 'unknown';
    const phase = s.phase_id || 'unknown';
    const units = Number(s.estimated_units || 0);
    const input = Number(s.input_tokens || 0);
    const output = Number(s.output_tokens || 0);
    if (s.source === 'stop-hook-input') hasMeasured = true;

    byTier[tier] = (byTier[tier] || 0) + units;
    byPhase[phase] = (byPhase[phase] || 0) + units;
    totalUnits += units;
    totalInputTokens += input;
    totalOutputTokens += output;
  }

  return {
    sample_count: samples.length,
    total_estimated_units: totalUnits,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    by_tier: byTier,
    by_phase: byPhase,
    has_measured_tokens: hasMeasured,
    note: hasMeasured
      ? 'Contains measured tokens from Stop hook input; duration-based units added for any unmeasured samples.'
      : 'Duration-based estimates only (tier-weighted). For RELATIVE tier comparison — not absolute billing.',
  };
}

export function finalizeSessionCost(cwd) {
  const samples = readCostSamples(cwd);
  const summary = summarizeCost(samples);
  try {
    const file = join(costDir(cwd), `session-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({
      finalized_at: new Date().toISOString(),
      summary,
      sample_count: samples.length,
    }, null, 2));
  } catch (error) {
    // Session finalization is non-fatal for cleanup, but we log instead of
    // silently swallowing so disk/permission problems are visible. R2.
    logHookError(error, 'forge-metrics:finalize-session-cost', cwd);
  }
  return summary;
}

// ── FR-3: Tier comparison consumer ────────────────────────────────────────
//
// readSessionCostHistory loads finalized session-*.json artifacts in mtime
// descending order, filtered to files that actually contain samples
// (summary.sample_count > 0). This filter is a safety net so that the 195
// pre-migration empty session files (or any future empty ones) cannot
// contaminate tier-comparison averages.
//
// compareTiers turns that history into a per-tier average unit count. It is
// an internal helper only — NOT exported — per Plan R5 (no new exported
// surface) and design §6 Q3.

function readSessionCostHistory(cwd, { limit = 10 } = {}) {
  const dir = costDir(cwd);
  if (!existsSync(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir)
      .filter(name => name.startsWith('session-') && name.endsWith('.json'))
      .map(name => {
        const path = join(dir, name);
        try {
          const stat = statSync(path);
          return { path, mtimeMs: stat.mtimeMs };
        } catch (error) {
          logHookError(error, 'forge-metrics:session-stat', cwd);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (error) {
    logHookError(error, 'forge-metrics:session-history-list', cwd);
    return [];
  }

  const history = [];
  for (const entry of entries) {
    if (history.length >= limit) break;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(entry.path, 'utf8'));
    } catch (error) {
      logHookError(error, 'forge-metrics:session-parse', cwd);
      continue;
    }
    const summary = parsed?.summary || {};
    const sampleCount = Number(summary.sample_count ?? parsed?.sample_count ?? 0) || 0;
    // Filter out empty shells — they would drag averages to zero and report
    // meaningless comparisons (design §3.2 option A safety net).
    if (sampleCount <= 0) continue;
    history.push({
      sample_count: sampleCount,
      by_tier: summary.by_tier || {},
      total_estimated_units: Number(summary.total_estimated_units || 0) || 0,
    });
  }
  return history;
}

function compareTiers(history) {
  // Aggregate {tier: [units per session]} then average per tier. A session
  // contributes to a tier only if that tier had non-zero units in it.
  const perTier = {};
  for (const session of history) {
    for (const [tier, units] of Object.entries(session.by_tier || {})) {
      const numeric = Number(units) || 0;
      if (numeric <= 0) continue;
      if (!perTier[tier]) perTier[tier] = [];
      perTier[tier].push(numeric);
    }
  }
  const averages = {};
  for (const [tier, units] of Object.entries(perTier)) {
    if (units.length === 0) continue;
    const sum = units.reduce((a, b) => a + b, 0);
    averages[tier] = Math.round(sum / units.length);
  }
  return { averages, session_count: history.length };
}

// ── Analytics ─────────────────────────────────────────────────────────────

function listFiles(dirPath, suffix = '') {
  if (!existsSync(dirPath)) {
    return [];
  }

  return readdirSync(dirPath)
    .filter(entry => !suffix || entry.endsWith(suffix))
    .map(entry => join(dirPath, entry))
    .filter(path => statSync(path).isFile())
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
}

function summarizeDirectory(relativeDir, files, cwd) {
  return {
    path: join(cwd, '.forge', relativeDir),
    count: files.length,
    recent: files.slice(0, 5).map(filePath => filePath.replace(`${cwd}/`, '')),
  };
}

export function buildForgeAnalyticsReport(cwd = '.') {
  const forgeDir = ensureForgeDir(cwd);
  const state = readForgeState(cwd);
  const runtime = readRuntimeState(cwd, { state });
  const eventFiles = listFiles(join(forgeDir, 'events'), '.jsonl');
  const evalJsonFiles = listFiles(join(forgeDir, 'eval'), '.json');
  const evalMarkdownFiles = listFiles(join(forgeDir, 'eval'), '.md');
  const evidenceFiles = listFiles(join(forgeDir, 'evidence'), '.md');
  const deliveryFiles = listFiles(join(forgeDir, 'delivery-report'), '.md');
  const verificationArtifact = readVerificationArtifact(cwd);
  const laneCount = Object.keys(runtime?.lanes || {}).length;
  const cost = summarizeCost(readCostSamples(cwd));
  const history = readSessionCostHistory(cwd, { limit: 10 });
  const tierComparison = compareTiers(history);
  const currentTier = runtime?.active_tier || state?.tier || '';

  return {
    project: {
      name: state?.project || '',
      phase_id: state?.phase_id || state?.phase || '',
      lane_count: laneCount,
    },
    artifacts: {
      events: summarizeDirectory('events', eventFiles, cwd),
      eval_json: summarizeDirectory('eval', evalJsonFiles, cwd),
      eval_markdown: summarizeDirectory('eval', evalMarkdownFiles, cwd),
      evidence: summarizeDirectory('evidence', evidenceFiles, cwd),
      delivery_report: summarizeDirectory('delivery-report', deliveryFiles, cwd),
      verification: {
        exists: Boolean(verificationArtifact),
        status: verificationArtifact?.status || '',
      },
    },
    cost,
    tier_comparison: {
      current_tier: currentTier,
      session_count: tierComparison.session_count,
      averages: tierComparison.averages,
    },
  };
}

export function renderForgeAnalyticsText(report) {
  const tierLines = renderTierComparisonLines(report.tier_comparison);
  return [
    `Project: ${report.project.name || '(unknown)'}`,
    `Phase: ${report.project.phase_id || '(unknown)'}`,
    `Lanes: ${report.project.lane_count}`,
    `Events: ${report.artifacts.events.count}`,
    `Eval JSON: ${report.artifacts.eval_json.count}`,
    `Eval Markdown: ${report.artifacts.eval_markdown.count}`,
    `Evidence: ${report.artifacts.evidence.count}`,
    `Delivery reports: ${report.artifacts.delivery_report.count}`,
    `Verification artifact: ${report.artifacts.verification.exists ? (report.artifacts.verification.status || 'present') : 'none'}`,
    `Cost samples: ${report.cost?.sample_count ?? 0} (${report.cost?.has_measured_tokens ? 'measured' : 'estimate'}, ${report.cost?.total_estimated_units ?? 0} units)`,
    ...tierLines,
  ].join('\n') + '\n';
}

// FR-3 AC-3a/3b: render a "Tier comparison" section. Requires ≥3 prior
// sessions with samples; otherwise emits an explicit insufficient-data line
// so the consumer stays explicit and mechanical.
function renderTierComparisonLines(comparison) {
  const MIN_SESSIONS = 3;
  const current = comparison?.current_tier || '(unknown)';
  const sessionCount = Number(comparison?.session_count || 0) || 0;
  if (sessionCount < MIN_SESSIONS) {
    return [
      `Tier comparison: insufficient data (need ≥ ${MIN_SESSIONS} prior sessions with samples)`,
    ];
  }
  const averages = comparison?.averages || {};
  const tiers = Object.keys(averages);
  if (tiers.length === 0) {
    return [
      `Tier comparison: insufficient data (need ≥ ${MIN_SESSIONS} prior sessions with samples)`,
    ];
  }
  const detail = tiers
    .map(tier => `${tier}: ${averages[tier]}u avg`)
    .join(' · ');
  return [
    `Tier comparison (current: ${current}):`,
    `  ${detail}`,
  ];
}
