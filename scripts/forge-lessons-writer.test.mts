import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLesson, validateLessonContent } from './lib/forge-lessons-writer.mjs';
import { loadAllLessons } from './lib/forge-lessons-loader.mjs';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'forge-lessons-writer-'));
}

const PATTERN_SECTIONS = {
  'what happened': 'State normalized twice and the second normalizer stripped metadata fields.',
  'root cause': 'Two separate normalizers disagreed on whether to preserve custom fields.',
  'prevention rule': 'Single owner per state shape — add to code-rules.md.',
  'applies when': 'React, state normalization, TypeScript',
};

describe('forge-lessons-writer > createLesson', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir();
  });

  afterEach(() => {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
  });

  it('writes a valid pattern lesson and returns the path', () => {
    const result = createLesson({
      cwd,
      type: 'pattern',
      title: 'State shape drift from double normalization',
      sourceNote: 'project-x / Phase 4 / hole-012',
      severity: 'high',
      sections: PATTERN_SECTIONS,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe('state-shape-drift-from-double-normalization');
      expect(existsSync(result.path)).toBe(true);
      const content = readFileSync(result.path, 'utf8');
      expect(content).toMatch(/^# LESSON: State shape drift/m);
      expect(content).toMatch(/^Type: pattern/m);
      expect(content).toMatch(/^## Applies when/m);
      expect(content).toMatch(/^## Prevention rule/m);
    }
  });

  it('round-trips through the reader', () => {
    const result = createLesson({
      cwd,
      type: 'pattern',
      title: 'Round trip test',
      sections: PATTERN_SECTIONS,
    });
    expect(result.ok).toBe(true);

    const { local } = loadAllLessons({ cwd, globalDir: '/tmp/nonexistent-forge-lessons-writer-test' });
    expect(local).toHaveLength(1);
    expect(local[0].type).toBe('pattern');
    expect(local[0].title).toBe('Round trip test');
    expect(local[0].applies_when).toMatch(/React/);
    expect(local[0].prevention).toMatch(/Single owner/);
  });

  it('rejects missing title', () => {
    const result = createLesson({ cwd, type: 'pattern', sections: PATTERN_SECTIONS } as any);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/title is required/);
    }
  });

  it('rejects invalid type', () => {
    const result = createLesson({
      cwd,
      type: 'bogus' as any,
      title: 'x',
      sections: PATTERN_SECTIONS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/type must be one of/);
    }
  });

  it('rejects missing "applies when" section', () => {
    const result = createLesson({
      cwd,
      type: 'pattern',
      title: 'x',
      sections: { 'what happened': 'a', 'prevention rule': 'b' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/applies when/i);
    }
  });

  it('rejects missing prevention/process/calibration section', () => {
    const result = createLesson({
      cwd,
      type: 'pattern',
      title: 'x',
      sections: { 'what happened': 'a', 'applies when': 'b' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/prevention/i);
    }
  });

  it('accepts process-type with process change section', () => {
    const result = createLesson({
      cwd,
      type: 'process',
      title: 'Handoff gaps caused rework',
      sections: {
        'what happened': 'Lead dev skipped the handoff interview.',
        impact: 'Half a day of rework on misread contracts.',
        'process change': 'Phase gate now requires handoff artifact.',
        'applies when': 'full tier, multi-team phase transitions',
      },
    });
    expect(result.ok).toBe(true);
  });

  it('accepts estimation-type with calibration rule', () => {
    const result = createLesson({
      cwd,
      type: 'estimation',
      title: 'Auth rewrites are always 2x',
      sections: {
        'estimated vs actual': 'Estimated 3d, actual 6d.',
        'why the gap': 'Legacy middleware assumptions were wrong.',
        'calibration rule': 'Multiply auth-touch estimates by 2 for legacy codebases.',
        'applies when': 'legacy auth middleware refactor',
      },
    });
    expect(result.ok).toBe(true);
  });

  it('refuses to overwrite existing lesson without overwrite flag', () => {
    const first = createLesson({ cwd, type: 'pattern', title: 'Dup', sections: PATTERN_SECTIONS });
    expect(first.ok).toBe(true);

    const second = createLesson({ cwd, type: 'pattern', title: 'Dup', sections: PATTERN_SECTIONS });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.errors.join(' ')).toMatch(/already exists/);
    }
  });

  it('allows overwrite when flag is set', () => {
    const first = createLesson({ cwd, type: 'pattern', title: 'Dup', sections: PATTERN_SECTIONS });
    expect(first.ok).toBe(true);

    const second = createLesson({
      cwd,
      type: 'pattern',
      title: 'Dup',
      sections: { ...PATTERN_SECTIONS, 'what happened': 'different' },
      overwrite: true,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(readFileSync(second.path, 'utf8')).toMatch(/different/);
    }
  });
});

describe('forge-lessons-writer > validateLessonContent', () => {
  it('accepts a valid pattern lesson', () => {
    const content = [
      '# LESSON: Valid',
      'Type: pattern',
      '',
      '## What happened',
      'x',
      '',
      '## Prevention rule',
      'y',
      '',
      '## Applies when',
      'z',
    ].join('\n');
    expect(validateLessonContent(content)).toEqual({ valid: true, errors: [] });
  });

  it('rejects empty content', () => {
    const result = validateLessonContent('');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/empty/);
  });

  it('rejects missing Type metadata', () => {
    const content = '# LESSON: X\n\n## Prevention rule\ny\n\n## Applies when\nz\n';
    const result = validateLessonContent(content);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Type/);
  });

  it('rejects unknown Type value', () => {
    const content = '# LESSON: X\nType: wrong\n\n## Prevention rule\ny\n\n## Applies when\nz\n';
    const result = validateLessonContent(content);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Type must be/);
  });
});
