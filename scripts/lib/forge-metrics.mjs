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
  } catch { /* non-fatal */ }
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
  } catch { /* non-fatal */ }
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
  } catch { /* non-fatal */ }
  return summary;
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
  };
}

export function renderForgeAnalyticsText(report) {
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
  ].join('\n') + '\n';
}
