import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roundPercent(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

export function getTraceabilityPath(cwd = '.') {
  return join(cwd, '.forge', 'traceability.json');
}

export function readTraceabilitySnapshot(cwd = '.') {
  const file = getTraceabilityPath(cwd);
  if (!existsSync(file)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function summarizeTraceability(snapshot = null) {
  const requirements = asArray(snapshot?.requirements)
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      id: typeof item.id === 'string' ? item.id : '',
      title: typeof item.title === 'string' ? item.title : '',
      status: typeof item.status === 'string' ? item.status : 'proposed',
      acceptanceCriteria: asArray(item.acceptanceCriteria),
    }));

  const total = requirements.length;
  const implemented = requirements.filter(req => req.status === 'implemented' || req.status === 'verified');
  const verified = requirements.filter(req => req.status === 'verified');
  const deferred = requirements.filter(req => req.status === 'deferred');
  const blocked = requirements.filter(req => req.status === 'blocked');
  const rejected = requirements.filter(req => req.status === 'rejected');
  const uncovered = requirements.filter(req => !['implemented', 'verified', 'deferred', 'rejected'].includes(req.status));

  return {
    total,
    completedCount: implemented.length,
    verifiedCount: verified.length,
    deferredCount: deferred.length,
    blockedCount: blocked.length,
    rejectedCount: rejected.length,
    uncoveredCount: uncovered.length,
    coveragePercent: roundPercent(implemented.length, total),
    verifiedPercent: roundPercent(verified.length, total),
    deferredIds: deferred.map(req => req.id),
    blockedIds: blocked.map(req => req.id),
    uncoveredIds: uncovered.map(req => req.id),
    requirements,
  };
}

export function renderTraceabilityMarkdown(summary) {
  const {
    total,
    completedCount,
    verifiedCount,
    coveragePercent,
    verifiedPercent,
    deferredIds,
    blockedIds,
    uncoveredIds,
  } = summary;

  const sections = [
    `Total requirements: ${total}`,
    `Coverage: ${completedCount}/${total} (${coveragePercent}%)`,
    `Verified: ${verifiedCount}/${total} (${verifiedPercent}%)`,
  ];

  if (deferredIds.length > 0) {
    sections.push(`Deferred: ${deferredIds.join(', ')}`);
  }
  if (blockedIds.length > 0) {
    sections.push(`Blocked: ${blockedIds.join(', ')}`);
  }
  if (uncoveredIds.length > 0) {
    sections.push(`Uncovered: ${uncoveredIds.join(', ')}`);
  }

  return sections.join('\n');
}
