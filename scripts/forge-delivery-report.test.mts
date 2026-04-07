import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

import {
  parseHoleReport,
  readHoleSummaries,
  renderDeliveryReport,
  scopeHoleSummariesToProject,
  writeDeliveryReport,
} from './lib/forge-delivery-report.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-delivery-'));
  mkdirSync(join(cwd, '.forge', 'holes'), { recursive: true });
  return cwd;
}

describe('forge delivery report', () => {
  const workspaces = [];

  afterEach(() => {
    for (const cwd of workspaces.splice(0, workspaces.length)) {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('parses severity and status across different hole formats', () => {
    const parsedA = parseHoleReport(`# HOLE-001\n\n**Severity:** Minor\n**Status:** resolved\n\n## Description\nExample`);
    const parsedB = parseHoleReport(`# Hole\n\n> Severity: blocker\n> Status: open\n\n## Symptom\nBroken`);
    const parsedC = parseHoleReport(`# Gap\n\n## Severity: critical\n## Status: in_progress\n\n### Problem\nBroken`);

    expect(parsedA.severity).toBe('minor');
    expect(parsedA.status).toBe('resolved');
    expect(parsedB.severity).toBe('blocker');
    expect(parsedC.severity).toBe('blocker');
    expect(parsedC.status).toBe('in_progress');
  });

  it('renders a delivery report from traceability and holes', () => {
    const markdown = renderDeliveryReport({
      project: 'demo',
      version: '0.3.3',
      generatedAt: '2026-04-05',
      traceabilitySummary: {
        total: 2,
        completedCount: 1,
        verifiedCount: 1,
        deferredCount: 0,
        blockedCount: 1,
        rejectedCount: 0,
        uncoveredCount: 1,
        coveragePercent: 50,
        verifiedPercent: 50,
        deferredIds: [],
        blockedIds: ['NFR-1'],
        uncoveredIds: ['NFR-1'],
        requirements: [
          { id: 'FR-1', title: 'Build X', summary: '', status: 'verified' },
          { id: 'NFR-1', title: 'Fast enough', summary: '', status: 'blocked' },
        ],
      },
      holeSummary: {
        blockers: [],
        majors: [],
        minors: [{ title: 'Minor visual bug', severity: 'minor', status: 'open', description: 'Known issue' }],
        cosmetics: [],
        blockerCount: 0,
        majorCount: 0,
        minorCount: 1,
      },
    });

    expect(markdown).toContain('# Delivery Report: demo');
    expect(markdown).toContain('Coverage: 50%');
    expect(markdown).toContain('Verified coverage: 50%');
    expect(markdown).toContain('| NFR-1 | blocked | blocked in traceability |');
    expect(markdown).toContain('Minor visual bug');
  });

  it('writes .forge/delivery-report/report.md', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify({ project: 'demo-project', version: '0.2.0' }, null, 2));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '0.3.3' }, null, 2));
    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-05T00:00:00.000Z',
      requirements: [
        { id: 'FR-1', title: 'Build X', status: 'verified', acceptanceCriteria: [] },
        { id: 'OPS-1', title: 'Docs', status: 'deferred', acceptanceCriteria: [] },
      ],
    }, null, 2));
    writeFileSync(join(cwd, '.forge', 'holes', 'HOLE-001.md'), `# HOLE-001\n\n**Severity:** Minor\n**Status:** open\n\n## Description\nKnown issue`);

    const result = writeDeliveryReport(cwd);
    const report = readFileSync(result.outputPath, 'utf8');

    expect(report).toContain('demo-project');
    expect(report).toContain('Coverage: 50%');
    expect(report).toContain('Verified coverage: 50%');
    expect(report).toContain('Known issue');
  });

  it('scopes hole summaries to the active project window', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify({
      project: 'scoped-project',
      created_at: '2026-04-06T00:00:00.000Z',
    }, null, 2));
    const oldHolePath = join(cwd, '.forge', 'holes', 'HOLE-OLD.md');
    const newHolePath = join(cwd, '.forge', 'holes', 'HOLE-NEW.md');
    writeFileSync(oldHolePath, '# Old\n\n**Severity:** blocker\n**Status:** open\n');
    writeFileSync(newHolePath, '# New\n\n**Severity:** major\n**Status:** open\n');
    utimesSync(oldHolePath, new Date('2026-04-05T00:00:00.000Z'), new Date('2026-04-05T00:00:00.000Z'));
    utimesSync(newHolePath, new Date('2026-04-06T01:00:00.000Z'), new Date('2026-04-06T01:00:00.000Z'));

    const holes = scopeHoleSummariesToProject(readHoleSummaries(cwd), {
      created_at: '2026-04-06T00:00:00.000Z',
    });
    expect(holes).toHaveLength(1);
    expect(holes[0].filePath).toBe(newHolePath);
  });

  it('prefers explicit state hole tracking when present', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    const trackedPath = join(cwd, '.forge', 'holes', 'HOLE-TRACKED.md');
    const legacyPath = join(cwd, '.forge', 'holes', 'HOLE-LEGACY.md');
    writeFileSync(trackedPath, '# Tracked\n\n**Severity:** major\n**Status:** open\n');
    writeFileSync(legacyPath, '# Legacy\n\n**Severity:** blocker\n**Status:** open\n');

    const holes = scopeHoleSummariesToProject(readHoleSummaries(cwd), {
      created_at: '2026-04-01T00:00:00.000Z',
      holes: ['HOLE-TRACKED'],
    });

    expect(holes).toHaveLength(1);
    expect(holes[0].filePath).toBe(trackedPath);
  });

  it('writes report path from CLI', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify({ project: 'cli-project' }, null, 2));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '0.3.3' }, null, 2));
    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-05T00:00:00.000Z',
      requirements: [
        { id: 'FR-1', title: 'Build X', status: 'implemented', acceptanceCriteria: [] },
      ],
    }, null, 2));

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-generate-delivery-report.mjs')], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toContain('.forge/delivery-report/report.md');
  });
});
