import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeRuntimeState } from './lib/forge-session.mjs';
import { syncTraceabilitySnapshot } from './lib/forge-traceability-sync.mjs';

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-traceability-sync-'));
  mkdirSync(join(cwd, '.forge', 'holes'), { recursive: true });
  return cwd;
}

describe('forge traceability sync', () => {
  const workspaces = [];

  afterEach(() => {
    for (const cwd of workspaces.splice(0, workspaces.length)) {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('syncs lane refs into traceability and promotes implemented status', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-05T00:00:00.000Z',
      requirements: [
        {
          id: 'FR-1',
          title: 'Build X',
          summary: '',
          rationale: '',
          type: 'functional',
          phaseOwner: 'develop',
          status: 'planned',
          acceptanceCriteria: [],
          designRefs: [],
          contractRefs: [],
          taskRefs: [],
          holeRefs: [],
          deliveryRefs: [],
        },
      ],
    }, null, 2));

    writeRuntimeState(cwd, {
      next_lane: 'shared',
      lanes: {
        shared: {
          id: 'shared',
          title: 'Shared lane',
          status: 'done',
          requirement_refs: ['FR-1'],
        },
      },
    });

    const result = syncTraceabilitySnapshot(cwd);
    expect(result.requirements[0].status).toBe('implemented');
    expect(result.requirements[0].taskRefs).toContain('lane:shared');
  });

  it('marks requirements blocked from open blocker holes', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-05T00:00:00.000Z',
      requirements: [
        {
          id: 'NFR-1',
          title: 'Fast enough',
          summary: '',
          rationale: '',
          type: 'non_functional',
          phaseOwner: 'qa',
          status: 'implemented',
          acceptanceCriteria: [],
          designRefs: [],
          contractRefs: [],
          taskRefs: [],
          holeRefs: [],
          deliveryRefs: [],
        },
      ],
    }, null, 2));

    writeFileSync(join(cwd, '.forge', 'holes', 'HOLE-001.md'), `# HOLE-001

**Severity:** Major
**Status:** open

## Related Requirements

- Requirement IDs:
  - NFR-1
`);

    const result = syncTraceabilitySnapshot(cwd);
    expect(result.requirements[0].status).toBe('blocked');
    expect(result.requirements[0].holeRefs[0]).toContain('HOLE-001.md');
  });

  it('promotes implemented requirements to verified when linked holes are verified', () => {
    const cwd = makeWorkspace();
    workspaces.push(cwd);

    writeFileSync(join(cwd, '.forge', 'traceability.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-05T00:00:00.000Z',
      requirements: [
        {
          id: 'FR-2',
          title: 'Build Y',
          summary: '',
          rationale: '',
          type: 'functional',
          phaseOwner: 'fix',
          status: 'implemented',
          acceptanceCriteria: [],
          designRefs: [],
          contractRefs: [],
          taskRefs: [],
          holeRefs: [],
          deliveryRefs: [],
        },
      ],
    }, null, 2));

    writeFileSync(join(cwd, '.forge', 'holes', 'HOLE-002.md'), `# HOLE-002

**Severity:** Major
**Status:** verified

## Related Requirements

- Requirement IDs:
  - FR-2
`);

    const result = syncTraceabilitySnapshot(cwd);
    expect(result.requirements[0].status).toBe('verified');
    expect(result.requirements[0].holeRefs[0]).toContain('HOLE-002.md');
  });
});
