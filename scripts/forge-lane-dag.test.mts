import { describe, it, expect } from 'vitest';
import { validateLaneDag, cleanupMergedLanes } from './lib/forge-lane-dag.mjs';

describe('validateLaneDag', () => {
  it('returns valid for empty lanes', () => {
    expect(validateLaneDag({})).toEqual({ valid: true, cycles: [], orphans: [] });
  });

  it('returns valid for null input', () => {
    expect(validateLaneDag(null)).toEqual({ valid: true, cycles: [], orphans: [] });
  });

  it('returns valid for acyclic graph', () => {
    const lanes = {
      A: { deps: [] },
      B: { deps: ['A'] },
      C: { deps: ['A', 'B'] },
    };
    expect(validateLaneDag(lanes).valid).toBe(true);
  });

  it('detects simple cycle A→B→A', () => {
    const lanes = {
      A: { deps: ['B'] },
      B: { deps: ['A'] },
    };
    const result = validateLaneDag(lanes);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('detects three-node cycle A→B→C→A', () => {
    const lanes = {
      A: { deps: ['C'] },
      B: { deps: ['A'] },
      C: { deps: ['B'] },
    };
    const result = validateLaneDag(lanes);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('detects orphan dependency referencing non-existent lane', () => {
    const lanes = {
      A: { deps: ['Z'] },
      B: { deps: [] },
    };
    const result = validateLaneDag(lanes);
    expect(result.valid).toBe(false);
    expect(result.orphans).toContain('A → Z (not found)');
  });

  it('detects self-reference', () => {
    const lanes = {
      A: { deps: ['A'] },
    };
    const result = validateLaneDag(lanes);
    expect(result.valid).toBe(false);
    expect(result.orphans).toContain('A (self-reference)');
  });

  it('handles lanes without deps field', () => {
    const lanes = {
      A: { status: 'pending' },
      B: { status: 'pending' },
    };
    expect(validateLaneDag(lanes).valid).toBe(true);
  });
});

describe('cleanupMergedLanes', () => {
  it('returns empty object for null input', () => {
    expect(cleanupMergedLanes(null)).toEqual({});
  });

  it('removes merged lane IDs from deps', () => {
    const lanes = {
      A: { deps: [], status: 'merged' },
      B: { deps: ['A', 'C'], status: 'in_progress' },
      C: { deps: [], status: 'pending' },
    };
    const result = cleanupMergedLanes(lanes);
    expect(result.B.deps).toEqual(['C']);
  });

  it('removes done lane IDs from deps', () => {
    const lanes = {
      A: { deps: [], status: 'done' },
      B: { deps: ['A'], status: 'pending' },
    };
    const result = cleanupMergedLanes(lanes);
    expect(result.B.deps).toEqual([]);
  });

  it('clears worktree reference for merged lanes', () => {
    const lanes = {
      A: { deps: [], status: 'merged', worktree: '/tmp/wt-A' },
    };
    const result = cleanupMergedLanes(lanes);
    expect(result.A.worktree).toBe('');
  });

  it('does not mutate input', () => {
    const lanes = {
      A: { deps: [], status: 'merged' },
      B: { deps: ['A'], status: 'pending' },
    };
    const original = JSON.parse(JSON.stringify(lanes));
    cleanupMergedLanes(lanes);
    expect(lanes).toEqual(original);
  });

  it('preserves non-merged lanes unchanged', () => {
    const lanes = {
      A: { deps: ['B'], status: 'in_progress', worktree: '/tmp/wt-A' },
      B: { deps: [], status: 'pending' },
    };
    const result = cleanupMergedLanes(lanes);
    expect(result.A.deps).toEqual(['B']);
    expect(result.A.worktree).toBe('/tmp/wt-A');
  });
});
