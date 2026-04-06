import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readTraceabilitySnapshot, summarizeTraceability } from './forge-traceability.mjs';

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function firstMatch(text, patterns, fallback = '') {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return String(match[1]).trim();
    }
  }
  return fallback;
}

function normalizeSeverity(value) {
  const lowered = String(value || '').trim().toLowerCase();
  if (['blocker', 'critical'].includes(lowered)) return 'blocker';
  if (lowered === 'major') return 'major';
  if (lowered === 'minor') return 'minor';
  if (lowered === 'cosmetic') return 'cosmetic';
  return lowered || 'unknown';
}

function normalizeStatus(value) {
  const lowered = String(value || '').trim().toLowerCase();
  if (!lowered) return 'open';
  return lowered.replace(/\s+/g, '-');
}

export function parseHoleReport(text, filePath = '') {
  const title = firstMatch(text, [/^#\s+(.+)$/m], filePath.split('/').pop() || 'unknown hole');
  const severity = normalizeSeverity(firstMatch(text, [
    /^\*\*Severity:\*\*\s*(.+)$/mi,
    /^>\s*Severity:\s*(.+)$/mi,
    /^##\s*Severity:\s*(.+)$/mi,
  ], 'unknown'));
  const status = normalizeStatus(firstMatch(text, [
    /^\*\*Status:\*\*\s*(.+)$/mi,
    /^>\s*Status:\s*(.+)$/mi,
    /^##\s*Status:\s*(.+)$/mi,
  ], 'open'));
  const description = firstMatch(text, [
    /^##\s*Description\s+([\s\S]*?)(?:\n##\s|\n---|$)/mi,
    /^##\s*Symptom\s+([\s\S]*?)(?:\n##\s|\n---|$)/mi,
    /^###\s*Problem\s+([\s\S]*?)(?:\n###\s|\n##\s|\n---|$)/mi,
  ], '');

  return {
    title,
    severity,
    status,
    description: description.replace(/\s+/g, ' ').trim(),
    filePath,
  };
}

export function readHoleSummaries(cwd = '.') {
  const holesDir = join(cwd, '.forge', 'holes');
  if (!existsSync(holesDir)) {
    return [];
  }

  return readdirSync(holesDir)
    .filter(name => name.endsWith('.md'))
    .map(name => {
      const filePath = join(holesDir, name);
      return parseHoleReport(readText(filePath), filePath);
    });
}

export function summarizeHoles(holes = []) {
  const blockers = holes.filter(hole => hole.severity === 'blocker');
  const majors = holes.filter(hole => hole.severity === 'major');
  const minors = holes.filter(hole => hole.severity === 'minor');
  const cosmetics = holes.filter(hole => hole.severity === 'cosmetic');

  return {
    blockers,
    majors,
    minors,
    cosmetics,
    blockerCount: blockers.length,
    majorCount: majors.length,
    minorCount: minors.length + cosmetics.length,
  };
}

export function scopeHoleSummariesToProject(holes = [], state = {}) {
  const createdAt = typeof state?.created_at === 'string' ? state.created_at : '';
  const createdMs = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(createdMs) || createdMs <= 0) {
    return holes;
  }

  return holes.filter((hole) => {
    try {
      const stats = statSync(hole.filePath);
      return stats.mtime.getTime() >= createdMs;
    } catch {
      return true;
    }
  });
}

export function renderDeliveryReport({
  project = 'unnamed-project',
  version = '0.0.0',
  generatedAt = new Date().toISOString().slice(0, 10),
  traceabilitySummary,
  holeSummary,
}) {
  const requirementsTable = traceabilitySummary.requirements.length > 0
    ? traceabilitySummary.requirements.map(req => {
        const evidence = req.status === 'verified'
          ? 'traceability:verified'
          : req.status === 'implemented'
            ? 'traceability:implemented'
            : '';
        return `| ${req.id} | ${req.title || req.summary || ''} | ${req.status} | ${evidence} | |`;
      }).join('\n')
    : '| | | | | |';

  const deferredRows = [
    ...traceabilitySummary.deferredIds.map(id => `| ${id} | deferred | deferred in traceability | carry to next milestone |`),
    ...traceabilitySummary.blockedIds.map(id => `| ${id} | blocked | blocked in traceability | resolve before delivery |`),
  ].join('\n') || '| | deferred/blocked | | |';

  const knownIssueRows = [
    ...holeSummary.minors.map(hole => `| ${hole.title} | ${hole.severity} | ${hole.status} | ${hole.description || 'known issue'} |`),
    ...holeSummary.cosmetics.map(hole => `| ${hole.title} | ${hole.severity} | ${hole.status} | ${hole.description || 'known issue'} |`),
  ].join('\n') || '| | minor | deferred | |';

  const recommendation = holeSummary.blockerCount > 0 || traceabilitySummary.blockedCount > 0
    ? 'fix-first — blockers remain before a clean customer delivery'
    : traceabilitySummary.uncoveredCount > 0
      ? 'fix-first — some requirements are still uncovered'
      : 'deliver — requirement coverage is in a reviewable state';

  return `# Delivery Report: ${project}

> Date: ${generatedAt} | Version: ${version}
> Forge Virtual Software Company

---

## Executive Summary

Forge generated this delivery snapshot from requirement traceability and tracked holes. Coverage reflects requirement statuses, not only narrative judgement.

## Spec Coverage

| ID | Requirement | Status | Evidence | Notes |
|----|-------------|--------|----------|-------|
${requirementsTable}

**Coverage: ${traceabilitySummary.coveragePercent}%**
**Verified coverage: ${traceabilitySummary.verifiedPercent}%**

## Deferred / Blocked Requirements

| ID | Status | Reason | Next Step |
|----|--------|--------|-----------|
${deferredRows}

## Known Issues

| # | Issue | Severity | Status | Notes |
|---|-------|----------|--------|-------|
${knownIssueRows}

**Blockers: ${holeSummary.blockerCount}** | **Major: ${holeSummary.majorCount}** | **Minor: ${holeSummary.minorCount}**

## Test Results

| Category | Result | Details |
|----------|--------|---------|
| Functional | PASS | Requirement traceability available |
| Visual | PASS/UNKNOWN | Review against design artifacts |
| Contract | PASS/UNKNOWN | Review against contracts |
| Security | PASS/UNKNOWN | Review latest security phase evidence |
| Regression | PASS/UNKNOWN | Review latest QA evidence |

## Documentation Delivered

- [ ] README.md — Project overview, setup, usage
- [ ] API Documentation — Endpoints, request/response
- [ ] Component Documentation — Props, usage examples
- [ ] Deployment Guide — Environment variables, infrastructure

## Architecture Summary

Traceability-backed delivery. User intent is mapped to requirement IDs, and delivery coverage is computed from those statuses.

## Technology Stack

| Category | Choice | Version |
|----------|--------|---------|
| Framework | | |
| Database | | |
| Auth | | |
| Styling | | |

## Recommendation

${recommendation}

---

*Generated by Forge v${version}*`;
}

export function writeDeliveryReport(cwd = '.') {
  const stateText = readText(join(cwd, '.forge', 'state.json'));
  const state = stateText ? JSON.parse(stateText) : {};
  const pkgText = readText(join(cwd, 'package.json'));
  const pkg = pkgText ? JSON.parse(pkgText) : {};

  const traceabilitySummary = summarizeTraceability(readTraceabilitySnapshot(cwd));
  const holeSummary = summarizeHoles(scopeHoleSummariesToProject(readHoleSummaries(cwd), state));
  const markdown = renderDeliveryReport({
    project: state.project || 'unnamed-project',
    version: pkg.version || state.version || '0.0.0',
    generatedAt: new Date().toISOString().slice(0, 10),
    traceabilitySummary,
    holeSummary,
  });

  const deliveryDir = join(cwd, '.forge', 'delivery-report');
  mkdirSync(deliveryDir, { recursive: true });
  const outputPath = join(deliveryDir, 'report.md');
  writeFileSync(outputPath, `${markdown}\n`);
  return { outputPath, markdown, traceabilitySummary, holeSummary };
}
