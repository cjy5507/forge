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
      A: { dependencies: [] },
      B: { dependencies: ['A'] },
      C: { dependencies: ['A', 'B'] },
    };
    expect(validateLaneDag(lanes).valid).toBe(true);
  });

  it('detects simple cycle A→B→A', () => {
    const lanes = {
      A: { dependencies: ['B'] },
      B: { dependencies: ['A'] },
    };
    const result = validateLaneDag(lanes);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('detects three-node cycle A→B→C→A', () => {
    const lanes = {
      A: { dependencies: ['C'] },
      B: { dependencies: ['A'] },
      C: { dependencies: ['B'] },
    };
    const result = validateLaneDag(lanes);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('detects orphan dependency referencing non-existent lane', () => {
    const lanes = {
      A: { dependencies: ['Z'] },
      B: { dependencies: [] },
    };
    const result = validateLaneDag(lanes);
    expect(result.valid).toBe(false);
    expect(result.orphans).toContain('A → Z (not found)');
  });

  it('detects self-reference', () => {
    const lanes = {
      A: { dependencies: ['A'] },
    };
    const result = validateLaneDag(lanes);
    expect(result.valid).toBe(false);
    expect(result.orphans).toContain('A (self-reference)');
  });

  it('handles lanes without dependencies field', () => {
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

  it('removes merged lane IDs from dependencies', () => {
    const lanes = {
      A: { dependencies: [], status: 'merged' },
      B: { dependencies: ['A', 'C'], status: 'in_progress' },
      C: { dependencies: [], status: 'pending' },
    };
    const result = cleanupMergedLanes(lanes);
    expect(result.B.dependencies).toEqual(['C']);
  });

  it('removes done lane IDs from dependencies', () => {
    const lanes = {
      A: { dependencies: [], status: 'done' },
      B: { dependencies: ['A'], status: 'pending' },
    };
    const result = cleanupMergedLanes(lanes);
    expect(result.B.dependencies).toEqual([]);
  });

  it('clears worktree reference for merged lanes', () => {
    const lanes = {
      A: { dependencies: [], status: 'merged', worktree: '/tmp/wt-A' },
    };
    const result = cleanupMergedLanes(lanes);
    expect(result.A.worktree).toBe('');
  });

  it('does not mutate input', () => {
    const lanes = {
      A: { dependencies: [], status: 'merged' },
      B: { dependencies: ['A'], status: 'pending' },
    };
    const original = JSON.parse(JSON.stringify(lanes));
    cleanupMergedLanes(lanes);
    expect(lanes).toEqual(original);
  });

  it('preserves non-merged lanes unchanged', () => {
    const lanes = {
      A: { dependencies: ['B'], status: 'in_progress', worktree: '/tmp/wt-A' },
      B: { dependencies: [], status: 'pending' },
    };
    const result = cleanupMergedLanes(lanes);
    expect(result.A.dependencies).toEqual(['B']);
    expect(result.A.worktree).toBe('/tmp/wt-A');
  });
});
