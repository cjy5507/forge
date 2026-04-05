import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

import {
  readTraceabilitySnapshot,
  renderTraceabilityMarkdown,
  summarizeTraceability,
} from './lib/forge-traceability.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-traceability-'));
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

describe('forge traceability', () => {
  const workspaces = [];

  afterEach(() => {
    for (const cwd of workspaces.splice(0, workspaces.length)) {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('summarizes requirement coverage from traceability.json', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-05T00:00:00.000Z',
      requirements: [
        { id: 'FR-1', title: 'Build X', status: 'verified', acceptanceCriteria: [] },
        { id: 'FR-2', title: 'Build Y', status: 'implemented', acceptanceCriteria: [] },
        { id: 'NFR-1', title: 'Fast enough', status: 'blocked', acceptanceCriteria: [] },
        { id: 'OPS-1', title: 'Docs', status: 'deferred', acceptanceCriteria: [] },
      ],
    }, null, 2));

    const snapshot = readTraceabilitySnapshot(cwd);
    const summary = summarizeTraceability(snapshot);

    expect(summary.total).toBe(4);
    expect(summary.completedCount).toBe(2);
    expect(summary.verifiedCount).toBe(1);
    expect(summary.coveragePercent).toBe(50);
    expect(summary.verifiedPercent).toBe(25);
    expect(summary.blockedIds).toEqual(['NFR-1']);
    expect(summary.deferredIds).toEqual(['OPS-1']);
    expect(summary.uncoveredIds).toEqual(['NFR-1']);
  });

  it('renders a markdown summary', () => {
    const markdown = renderTraceabilityMarkdown({
      total: 3,
      completedCount: 2,
      verifiedCount: 1,
      coveragePercent: 67,
      verifiedPercent: 33,
      deferredIds: ['OPS-1'],
      blockedIds: ['NFR-1'],
      uncoveredIds: ['NFR-1'],
    });

    expect(markdown).toContain('Coverage: 2/3 (67%)');
    expect(markdown).toContain('Verified: 1/3 (33%)');
    expect(markdown).toContain('Deferred: OPS-1');
  });

  it('prints JSON summary from the CLI', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-05T00:00:00.000Z',
      requirements: [
        { id: 'FR-1', title: 'Build X', status: 'verified', acceptanceCriteria: [] },
      ],
    }, null, 2));

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-traceability-report.mjs')], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.coveragePercent).toBe(100);
    expect(parsed.verifiedPercent).toBe(100);
  });

  it('prints markdown summary from the CLI', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-05T00:00:00.000Z',
      requirements: [
        { id: 'FR-1', title: 'Build X', status: 'implemented', acceptanceCriteria: [] },
        { id: 'NFR-1', title: 'Fast enough', status: 'blocked', acceptanceCriteria: [] },
      ],
    }, null, 2));

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-traceability-report.mjs'), '--markdown'], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Coverage: 1/2 (50%)');
    expect(result.stdout).toContain('Blocked: NFR-1');
  });
});
