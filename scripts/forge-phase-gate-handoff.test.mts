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

  it('repair mode phases do not enforce build handoff flags', () => {
    const result = checkPhaseGate(cwd, 'isolate', 'repair', { tier: 'full' });
    // isolate gate requires 'evidence' but not handoff.
    expect(result.missing).not.toContain('handoff-interviews/isolate.md');
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
