import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { inferRequirementRefsForComponents } from './lib/forge-requirement-mapper.mjs';

const TEMP_DIRS: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-req-map-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function writeTraceability(cwd: string, requirements: any[]) {
  writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    requirements,
  }, null, 2));
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe('forge requirement mapper', () => {
  it('returns an empty mapping when no traceability snapshot exists', () => {
    const cwd = makeWorkspace();

    expect(inferRequirementRefsForComponents(cwd, 'Implement auth lane', [{ id: 'auth', areas: ['auth'] }])).toEqual([]);
  });

  it('reuses explicit requirement references for every decomposed component', () => {
    const cwd = makeWorkspace();
    writeTraceability(cwd, [
      {
        id: 'FR-2',
        title: 'Build auth flow',
        summary: 'Implement login and session handling',
        rationale: 'users need auth',
        acceptanceCriteria: [{ id: 'FR-2-AC-1', text: 'Login succeeds' }],
      },
      {
        id: 'OPS-1',
        title: 'Document rollout',
        summary: 'Add rollout notes',
        rationale: 'ops needs docs',
        acceptanceCriteria: [{ id: 'OPS-1-AC-1', text: 'Docs shipped' }],
      },
    ]);

    const mapped = inferRequirementRefsForComponents(
      cwd,
      'Implement FR-2 and OPS-1 together',
      [
        { id: 'auth', areas: ['auth'] },
        { id: 'docs', areas: ['shared'] },
      ],
    );

    expect(mapped).toHaveLength(2);
    for (const lane of mapped) {
      expect(lane.requirementRefs).toEqual(['FR-2', 'OPS-1']);
      expect(lane.acceptanceRefs).toEqual(['FR-2-AC-1', 'OPS-1-AC-1']);
    }
  });

  it('maps shared and area-specific components using requirement keywords', () => {
    const cwd = makeWorkspace();
    writeTraceability(cwd, [
      {
        id: 'FR-1',
        title: 'Shared config foundation',
        summary: 'Create shared config and common types',
        rationale: 'platform consistency',
        acceptanceCriteria: [{ id: 'FR-1-AC-1', text: 'Shared config is reusable' }],
      },
      {
        id: 'FR-2',
        title: 'Auth login',
        summary: 'Support login session token flow',
        rationale: 'users need sign in',
        acceptanceCriteria: [{ id: 'FR-2-AC-1', text: 'Login works' }],
      },
      {
        id: 'FR-3',
        title: 'Frontend page polish',
        summary: 'Improve page layout and component styling',
        rationale: 'better UX',
        acceptanceCriteria: [{ id: 'FR-3-AC-1', text: 'Page looks polished' }],
      },
    ]);

    const mapped = inferRequirementRefsForComponents(cwd, 'Split work by area', [
      { id: 'shared', areas: ['shared'] },
      { id: 'auth', areas: ['auth'] },
      { id: 'ui', areas: ['frontend'] },
    ]);

    expect(mapped).toEqual([
      { laneId: 'shared', requirementRefs: ['FR-1'], acceptanceRefs: ['FR-1-AC-1'] },
      { laneId: 'auth', requirementRefs: ['FR-2'], acceptanceRefs: ['FR-2-AC-1'] },
      { laneId: 'ui', requirementRefs: ['FR-3'], acceptanceRefs: ['FR-3-AC-1'] },
    ]);
  });

  it('maps a single component to all known requirements when decomposition stays serial', () => {
    const cwd = makeWorkspace();
    writeTraceability(cwd, [
      {
        id: 'FR-1',
        title: 'API response contract',
        summary: 'Return structured backend data',
        rationale: 'UI depends on API shape',
        acceptanceCriteria: [{ id: 'FR-1-AC-1', text: 'API returns typed data' }],
      },
      {
        id: 'NFR-1',
        title: 'Latency budget',
        summary: 'Backend remains fast',
        rationale: 'protect performance',
        acceptanceCriteria: [{ id: 'NFR-1-AC-1', text: 'Response stays under target latency' }],
      },
    ]);

    const mapped = inferRequirementRefsForComponents(cwd, 'Handle the work in one lane', [
      { id: 'api', areas: ['backend'] },
    ]);

    expect(mapped).toEqual([
      {
        laneId: 'api',
        requirementRefs: ['FR-1', 'NFR-1'],
        acceptanceRefs: ['FR-1-AC-1', 'NFR-1-AC-1'],
      },
    ]);
  });
});
