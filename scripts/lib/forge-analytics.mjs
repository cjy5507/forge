import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ensureForgeDir } from './forge-io.mjs';
import { readForgeState, readRuntimeState } from './forge-session.mjs';

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
  const laneCount = Object.keys(runtime?.lanes || {}).length;

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
    },
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
  ].join('\n') + '\n';
}
