import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ensureForgeDir } from './forge-io.mjs';
import { readVerificationArtifact } from './forge-verification.mjs';
import { readForgeState, readRuntimeState } from './forge-session.mjs';
import { readCostSamples, summarizeCost } from './forge-cost.mjs';

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
