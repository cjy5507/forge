import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { validatePhaseTransition } from './lib/forge-phases.mjs';
import { validateStateConsistency, completeForgeProject, cancelForgeProject, isProjectTerminal, readForgeState, writeForgeState } from './lib/forge-session.mjs';
import { normalizeDeliveryReadiness } from './lib/forge-io.mjs';

const TEMP_DIRS: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-sm-'));
  TEMP_DIRS.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function seedState(cwd: string, overrides = {}) {
  const state = {
    version: '0.2.0',
    project: 'test-project',
    phase: 'plan',
    phase_id: 'plan',
    mode: 'express',
    status: 'active',
    tier: 'medium',
    ...overrides,
  };
  writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify(state, null, 2));
  return state;
}

afterEach(() => {
  for (const dir of TEMP_DIRS) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  TEMP_DIRS.length = 0;
});

// ─── validatePhaseTransition ──────────────────────────────────────────

describe('validatePhaseTransition', () => {
  it('allows forward transitions', () => {
    const result = validatePhaseTransition('plan', 'build', 'express');
    expect(result.valid).toBe(true);
    expect(result.reason).toBe('forward');
  });

  it('allows same phase', () => {
    const result = validatePhaseTransition('build', 'build', 'express');
    expect(result.valid).toBe(true);
  });

  it('blocks backward transitions', () => {
    const result = validatePhaseTransition('build', 'plan', 'express');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('backward');
  });

  it('allows backward with rollback flag', () => {
    const result = validatePhaseTransition('build', 'plan', 'express', { allowRollback: true });
    expect(result.valid).toBe(true);
    expect(result.reason).toBe('rollback');
  });

  it('works with build mode sequences', () => {
    expect(validatePhaseTransition('discovery', 'design', 'build').valid).toBe(true);
    expect(validatePhaseTransition('design', 'discovery', 'build').valid).toBe(false);
  });

  it('allows unknown phases with warning', () => {
    const result = validatePhaseTransition('unknown_phase', 'build', 'express');
    expect(result.valid).toBe(true);
    expect(result.reason).toContain('unknown');
  });
});

// ─── validateStateConsistency ─────────────────────────────────────────

describe('validateStateConsistency', () => {
  it('passes for consistent state', () => {
    const state = { phase: 'build', phase_id: 'build', mode: 'express', status: 'active' };
    const runtime = { delivery_readiness: 'in_progress' };
    const result = validateStateConsistency(state, runtime);
    expect(result.valid).toBe(true);
    expect(result.corrections).toHaveLength(0);
  });

  it('detects early phase + delivered contradiction', () => {
    const state = { phase: 'plan', phase_id: 'plan', mode: 'express', status: 'active' };
    const runtime = { delivery_readiness: 'delivered' };
    const result = validateStateConsistency(state, runtime);
    expect(result.valid).toBe(false);
    expect(result.corrections.length).toBeGreaterThan(0);
    expect(result.runtimeFixes.delivery_readiness).toBe('in_progress');
  });

  it('detects completed status with non-complete phase', () => {
    const state = { phase: 'build', phase_id: 'build', mode: 'express', status: 'completed' };
    const runtime = { delivery_readiness: 'unknown' };
    const result = validateStateConsistency(state, runtime);
    expect(result.valid).toBe(false);
    expect(result.runtimeFixes.delivery_readiness).toBe('completed');
  });

  it('handles null inputs gracefully', () => {
    expect(validateStateConsistency(null, null).valid).toBe(true);
    expect(validateStateConsistency(null, {}).valid).toBe(true);
    expect(validateStateConsistency({}, null).valid).toBe(true);
  });
});

// ─── normalizeDeliveryReadiness ───────────────────────────────────────

describe('normalizeDeliveryReadiness', () => {
  it('accepts completed and cancelled', () => {
    expect(normalizeDeliveryReadiness('completed')).toBe('completed');
    expect(normalizeDeliveryReadiness('cancelled')).toBe('cancelled');
  });

  it('still accepts existing values', () => {
    expect(normalizeDeliveryReadiness('delivered')).toBe('delivered');
    expect(normalizeDeliveryReadiness('in_progress')).toBe('in_progress');
    expect(normalizeDeliveryReadiness('unknown')).toBe('unknown');
  });
});

// ─── completeForgeProject / cancelForgeProject ────────────────────────

describe('completeForgeProject', () => {
  it('marks project as completed', () => {
    const cwd = makeWorkspace();
    seedState(cwd, { phase: 'ship', status: 'active' });
    completeForgeProject(cwd);

    const state = readForgeState(cwd);
    expect(state.status).toBe('completed');
    expect(state.phase_id).toBe('complete');
  });

  it('returns null for missing project', () => {
    const cwd = makeWorkspace();
    expect(completeForgeProject(cwd)).toBeNull();
  });
});

describe('cancelForgeProject', () => {
  it('marks project as cancelled', () => {
    const cwd = makeWorkspace();
    seedState(cwd, { phase: 'build', status: 'active' });
    cancelForgeProject(cwd);

    const state = readForgeState(cwd);
    expect(state.status).toBe('cancelled');
  });
});

// ─── isProjectTerminal ────────────────────────────────────────────────

describe('isProjectTerminal', () => {
  it('detects completed project', () => {
    const cwd = makeWorkspace();
    seedState(cwd, { status: 'completed', phase: 'complete' });
    const result = isProjectTerminal(cwd);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('completed');
  });

  it('detects cancelled project', () => {
    const cwd = makeWorkspace();
    seedState(cwd, { status: 'cancelled' });
    const result = isProjectTerminal(cwd);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('cancelled');
  });

  it('detects active project as non-terminal', () => {
    const cwd = makeWorkspace();
    seedState(cwd, { status: 'active', phase: 'build' });
    const result = isProjectTerminal(cwd);
    expect(result.terminal).toBe(false);
  });

  it('returns non-terminal for no project', () => {
    const cwd = makeWorkspace();
    const result = isProjectTerminal(cwd);
    expect(result.terminal).toBe(false);
  });
});

// ─── writeForgeState transition guard ─────────────────────────────────

describe('writeForgeState transition guard', () => {
  it('blocks backward phase transition', () => {
    const cwd = makeWorkspace();
    seedState(cwd, { phase: 'build', phase_id: 'build', mode: 'express' });

    // Try to go backward to plan
    writeForgeState(cwd, {
      version: '0.2.0',
      project: 'test',
      phase: 'plan',
      phase_id: 'plan',
      mode: 'express',
      status: 'active',
      tier: 'medium',
    });

    const state = readForgeState(cwd);
    // Should stay at build (auto-corrected)
    expect(state.phase_id).toBe('build');
  });

  it('allows backward with rollback flag', () => {
    const cwd = makeWorkspace();
    seedState(cwd, { phase: 'build', phase_id: 'build', mode: 'express' });

    writeForgeState(cwd, {
      version: '0.2.0',
      project: 'test',
      phase: 'plan',
      phase_id: 'plan',
      mode: 'express',
      status: 'active',
      tier: 'medium',
    }, { allowRollback: true });

    const state = readForgeState(cwd);
    expect(state.phase_id).toBe('plan');
  });

  it('blocks forward advancement on full tier when required artifacts are missing', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, '.forge', 'state.json'), JSON.stringify({
      version: '0.2.0',
      project: 'test-project',
      phase: 'plan',
      phase_id: 'plan',
      mode: 'build',
      status: 'active',
      tier: 'full',
    }, null, 2));

    writeForgeState(cwd, {
      version: '0.2.0',
      project: 'test-project',
      phase: 'develop',
      phase_id: 'develop',
      mode: 'build',
      status: 'active',
      tier: 'full',
    });

    const state = readForgeState(cwd);
    const runtime = JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
    expect(state.phase_id).toBe('plan');
    expect(state._phase_gate_warning).toMatch(/plan\.md/);
    expect(runtime.delivery_readiness).toBe('blocked');
  });
});
