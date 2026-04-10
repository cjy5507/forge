import { existsSync, readFileSync, writeFileSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { readRuntimeState } from './forge-session.mjs';
import { normalizeRuntimeLanes } from './forge-lanes.mjs';
import { readHoleSummaries } from './forge-delivery-report.mjs';
import { getTraceabilityPath, readTraceabilitySnapshot } from './forge-traceability.mjs';

function uniq(values) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}

function getSnapshotPath(cwd = '.') {
  return getTraceabilityPath(cwd);
}

function parseRequirementRefsFromTask(taskFile = '', cwd = '.') {
  if (!taskFile) return [];
  const fullPath = isAbsolute(taskFile) ? taskFile : resolve(cwd, taskFile);
  if (!existsSync(fullPath)) return [];
  try {
    const text = readFileSync(fullPath, 'utf8');
    return uniq(
      text
        .split('\n')
        .map(line => line.match(/^\s*-\s*([A-Z]+-\d+)/)?.[1])
        .filter(Boolean),
    );
  } catch {
    return [];
  }
}

function parseRequirementRefsFromHoleText(text = '') {
  const refs = new Set();
  const requirementSection = text.match(/##\s*Related Requirements([\s\S]*?)(?:\n##\s|\n---|$)/i);
  const searchText = requirementSection?.[1] || text;
  for (const match of searchText.matchAll(/\b(?:FR|NFR|UX|OPS)-\d+\b/g)) {
    refs.add(match[0]);
  }
  return [...refs];
}

function createRequirementIndex(snapshot = null) {
  const next = snapshot && typeof snapshot === 'object'
    ? JSON.parse(JSON.stringify(snapshot))
    : { version: 1, generatedAt: new Date().toISOString(), requirements: [] };

  if (!Array.isArray(next.requirements)) {
    next.requirements = [];
  }

  const index = new Map();
  for (const req of next.requirements) {
    req.taskRefs = uniq(req.taskRefs);
    req.holeRefs = uniq(req.holeRefs);
    req.deliveryRefs = uniq(req.deliveryRefs);
    req.designRefs = uniq(req.designRefs);
    req.contractRefs = uniq(req.contractRefs);
    index.set(req.id, req);
  }

  return { snapshot: next, index };
}

function laneRefs(lane, cwd) {
  return uniq([
    ...(Array.isArray(lane.requirement_refs) ? lane.requirement_refs : []),
    ...parseRequirementRefsFromTask(lane.task_file || '', cwd),
  ]);
}

function isOpenHoleStatus(status = '') {
  return !['resolved', 'verified', 'closed'].includes(String(status || '').toLowerCase());
}

function isVerifiedHoleStatus(status = '') {
  return ['verified', 'closed'].includes(String(status || '').toLowerCase());
}

export function syncTraceabilitySnapshot(cwd = '.') {
  const existing = readTraceabilitySnapshot(cwd);
  if (!existing) {
    return null;
  }

  const { snapshot, index } = createRequirementIndex(existing);
  const runtime = readRuntimeState(cwd);
  const lanes = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}));
  const holes = readHoleSummaries(cwd);

  for (const req of snapshot.requirements) {
    req.taskRefs = [];
    req.holeRefs = [];
  }

  for (const lane of lanes) {
    const refs = laneRefs(lane, cwd);
    for (const ref of refs) {
      const req = index.get(ref);
      if (!req) continue;

      req.taskRefs = uniq([
        ...req.taskRefs,
        `lane:${lane.id}`,
        lane.task_file || '',
      ]);

      if (['in_progress', 'ready', 'in_review', 'blocked'].includes(lane.status) && ['planned', 'proposed'].includes(req.status)) {
        req.status = 'in_progress';
      }

      if (['done', 'merged'].includes(lane.status) && ['planned', 'proposed', 'in_progress'].includes(req.status)) {
        req.status = 'implemented';
      }
    }
  }

  const requirementHoleState = new Map();
  for (const hole of holes) {
    const text = hole.filePath && existsSync(hole.filePath) ? readFileSync(hole.filePath, 'utf8') : '';
    const refs = parseRequirementRefsFromHoleText(text);
    for (const ref of refs) {
      const req = index.get(ref);
      if (!req) continue;
      req.holeRefs = uniq([...req.holeRefs, hole.filePath || hole.title]);
      const current = requirementHoleState.get(ref) || { openBlocking: false, verified: false };
      requirementHoleState.set(ref, {
        openBlocking: current.openBlocking || (['blocker', 'major'].includes(hole.severity) && isOpenHoleStatus(hole.status)),
        verified: current.verified || isVerifiedHoleStatus(hole.status),
      });
      if (['blocker', 'major'].includes(hole.severity) && isOpenHoleStatus(hole.status)) {
        req.status = 'blocked';
      }
    }
  }

  for (const req of snapshot.requirements) {
    const holeState = requirementHoleState.get(req.id);
    if (!holeState) {
      continue;
    }

    if (holeState.openBlocking) {
      req.status = 'blocked';
      continue;
    }

    if (holeState.verified && ['implemented', 'in_progress'].includes(req.status)) {
      req.status = 'verified';
    }
  }

  snapshot.generatedAt = new Date().toISOString();
  writeFileSync(getSnapshotPath(cwd), `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}
