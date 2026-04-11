import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkPhaseGate } from './lib/forge-phases.mjs';

function makeWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'forge-gate-'));
  mkdirSync(join(dir, '.forge'), { recursive: true });
  return dir;
}

function writeSpec(cwd: string) {
  writeFileSync(
    join(cwd, '.forge', 'spec.md'),
    '# Spec\n\n## Overview\nTest project.\n\n## Constraints\nMinimum content to satisfy the size check and section validators.\n\nAdditional padding lines to ensure we exceed the byte threshold.',
  );
}

function writeHandoff(cwd: string, phaseId: string) {
  mkdirSync(join(cwd, '.forge', 'handoff-interviews'), { recursive: true });
  writeFileSync(
    join(cwd, '.forge', 'handoff-interviews', `${phaseId}.md`),
    `# Handoff to ${phaseId}\n\nReceiving team understanding statement.\n`,
  );
}

describe('checkPhaseGate — handoff-interview enforcement', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = makeWorkspace();
  });

  afterEach(() => {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
  });

  it('allows design advance at light tier even without handoff artifact', () => {
    writeSpec(cwd);
    const result = checkPhaseGate(cwd, 'design', 'build', { tier: 'light' });
    expect(result.canAdvance).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('blocks design advance at full tier when handoff artifact is missing', () => {
    writeSpec(cwd);
    const result = checkPhaseGate(cwd, 'design', 'build', { tier: 'full' });
    expect(result.canAdvance).toBe(false);
    expect(result.missing).toContain('handoff-interviews/design.md');
  });

  it('allows design advance at full tier when handoff artifact exists', () => {
    writeSpec(cwd);
    writeHandoff(cwd, 'design');
    const result = checkPhaseGate(cwd, 'design', 'build', { tier: 'full' });
    expect(result.canAdvance).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('rejects empty handoff artifact as missing', () => {
    writeSpec(cwd);
    mkdirSync(join(cwd, '.forge', 'handoff-interviews'), { recursive: true });
    writeFileSync(join(cwd, '.forge', 'handoff-interviews', 'design.md'), 'x');
    const result = checkPhaseGate(cwd, 'design', 'build', { tier: 'full' });
    expect(result.canAdvance).toBe(false);
    expect(result.missing).toContain('handoff-interviews/design.md');
  });

  it('does not enforce handoff for phases without handoff_required flag', () => {
    // discovery has no handoff_required flag.
    const result = checkPhaseGate(cwd, 'discovery', 'build', { tier: 'full' });
    expect(result.canAdvance).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('repair mode isolate phase does not require handoff (same-agent transition)', () => {
    const result = checkPhaseGate(cwd, 'isolate', 'repair', { tier: 'full' });
    // isolate gate requires 'evidence' but not handoff.
    expect(result.missing).not.toContain('handoff-interviews/isolate.md');
  });

  it('repair mode fix phase requires handoff at full tier (isolate→fix)', () => {
    // Satisfy the evidence/rca requirement.
    mkdirSync(join(cwd, '.forge', 'evidence', 'rca'), { recursive: true });
    writeFileSync(
      join(cwd, '.forge', 'evidence', 'rca', 'root-cause.md'),
      '# RCA\n\n## Finding\nIdentified cause.\n',
    );
    const result = checkPhaseGate(cwd, 'fix', 'repair', { tier: 'full' });
    expect(result.canAdvance).toBe(false);
    expect(result.missing).toContain('handoff-interviews/fix.md');
  });

  it('repair mode fix phase allows advance with handoff artifact at full tier', () => {
    mkdirSync(join(cwd, '.forge', 'evidence', 'rca'), { recursive: true });
    writeFileSync(
      join(cwd, '.forge', 'evidence', 'rca', 'root-cause.md'),
      '# RCA\n\n## Finding\nIdentified cause.\n',
    );
    writeHandoff(cwd, 'fix');
    const result = checkPhaseGate(cwd, 'fix', 'repair', { tier: 'full' });
    expect(result.canAdvance).toBe(true);
  });

  it('repair mode fix phase does not require handoff at light tier', () => {
    mkdirSync(join(cwd, '.forge', 'evidence', 'rca'), { recursive: true });
    writeFileSync(
      join(cwd, '.forge', 'evidence', 'rca', 'root-cause.md'),
      '# RCA\n\n## Finding\nIdentified cause.\n',
    );
    const result = checkPhaseGate(cwd, 'fix', 'repair', { tier: 'light' });
    expect(result.canAdvance).toBe(true);
  });
});

describe('checkPhaseGate — lessons-on-issues enforcement', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = makeWorkspace();
  });

  afterEach(() => {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
  });

  it('allows delivery when no holes were found', () => {
    const result = checkPhaseGate(cwd, 'delivery', 'build', { tier: 'light' });
    expect(result.canAdvance).toBe(true);
  });

  it('allows delivery when holes exist and lessons exist', () => {
    mkdirSync(join(cwd, '.forge', 'holes'), { recursive: true });
    writeFileSync(join(cwd, '.forge', 'holes', 'bug-001.md'), '# Hole\n\nissue.\n');
    mkdirSync(join(cwd, '.forge', 'lessons'), { recursive: true });
    writeFileSync(join(cwd, '.forge', 'lessons', 'l1.md'), '# LESSON: x\nType: pattern\n');
    const result = checkPhaseGate(cwd, 'delivery', 'build', { tier: 'light' });
    expect(result.canAdvance).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('blocks delivery when holes exist but no lessons recorded', () => {
    mkdirSync(join(cwd, '.forge', 'holes'), { recursive: true });
    writeFileSync(join(cwd, '.forge', 'holes', 'bug-001.md'), '# Hole\n\nissue.\n');
    const result = checkPhaseGate(cwd, 'delivery', 'build', { tier: 'light' });
    expect(result.canAdvance).toBe(false);
    expect(result.missing.join(' ')).toMatch(/lessons/);
  });

  it('blocks delivery when holes exist and lessons dir exists but is empty', () => {
    mkdirSync(join(cwd, '.forge', 'holes'), { recursive: true });
    writeFileSync(join(cwd, '.forge', 'holes', 'bug-001.md'), '# Hole\n\nissue.\n');
    mkdirSync(join(cwd, '.forge', 'lessons'), { recursive: true });
    const result = checkPhaseGate(cwd, 'delivery', 'build', { tier: 'light' });
    expect(result.canAdvance).toBe(false);
    expect(result.missing.join(' ')).toMatch(/lessons/);
  });
});
