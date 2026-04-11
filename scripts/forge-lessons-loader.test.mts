import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildLessonsBrief,
  initializeLessonsBrief,
  loadAllLessons,
  getLessonDirectories,
} from './lib/forge-lessons-loader.mjs';

const LESSON_PATTERN = `# LESSON: React state shape drift
Type: pattern
Source: project-x / Phase 4 / hole-012
Date: 2026-03-02
Severity: high

## What happened
State normalized twice, schema drifted.

## Root cause
Two separate normalizers disagreed.

## Prevention rule
- Single normalizer owner per shape

## Applies when
React, state normalization
`;

const LESSON_PROCESS = `# LESSON: Missing handoff context
Type: process
Source: project-y / Phase 3
Date: 2026-03-10

## What happened
Lead dev started without reading contracts.

## Process change
- Enforce handoff interview gate

## Applies when
any project
`;

function makeTempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('forge-lessons-loader', () => {
  let cwd: string;
  let globalDir: string;

  beforeEach(() => {
    cwd = makeTempDir('forge-lessons-cwd-');
    globalDir = makeTempDir('forge-lessons-global-');
  });

  afterEach(() => {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    if (globalDir) rmSync(globalDir, { recursive: true, force: true });
  });

  it('returns empty brief when no lesson directories exist', () => {
    const brief = buildLessonsBrief({ cwd, globalDir });
    expect(brief).toEqual([]);
  });

  it('parses a local pattern lesson and populates brief fields', () => {
    const lessonsDir = join(cwd, '.forge', 'lessons');
    mkdirSync(lessonsDir, { recursive: true });
    writeFileSync(join(lessonsDir, 'react-drift.md'), LESSON_PATTERN);

    const brief = buildLessonsBrief({ cwd, globalDir });
    expect(brief).toHaveLength(1);
    const entry = brief[0];
    expect(entry.id).toBe('react-drift');
    expect(entry.source).toBe('local');
    expect(entry.type).toBe('pattern');
    expect(entry.title).toMatch(/React state shape drift/);
    expect(entry.applies_when).toMatch(/React/);
    expect(entry.prevention).toMatch(/normalizer/);
    expect(entry.path.endsWith('react-drift.md')).toBe(true);
  });

  it('loads global lessons from the override directory', () => {
    writeFileSync(join(globalDir, 'global-pattern.md'), LESSON_PATTERN);
    const { local, global } = loadAllLessons({ cwd, globalDir });
    expect(local).toHaveLength(0);
    expect(global).toHaveLength(1);
    expect(global[0].source).toBe('global');
    expect(global[0].id).toBe('global-pattern');
  });

  it('filters by project type using applies_when tokens', () => {
    const lessonsDir = join(cwd, '.forge', 'lessons');
    mkdirSync(lessonsDir, { recursive: true });
    writeFileSync(join(lessonsDir, 'react-drift.md'), LESSON_PATTERN);
    writeFileSync(join(lessonsDir, 'process.md'), LESSON_PROCESS);

    const reactOnly = buildLessonsBrief({ cwd, globalDir, projectType: 'react' });
    const reactIds = reactOnly.map(entry => entry.id).sort();
    expect(reactIds).toContain('react-drift');
    expect(reactIds).not.toContain('process');
  });

  it('classifies malformed metadata as unknown type but keeps the file', () => {
    const lessonsDir = join(cwd, '.forge', 'lessons');
    mkdirSync(lessonsDir, { recursive: true });
    writeFileSync(
      join(lessonsDir, 'bad.md'),
      '# LESSON: Malformed\nType: nonsense\n\n## What happened\nfoo\n',
    );

    const { local } = loadAllLessons({ cwd, globalDir });
    expect(local).toHaveLength(1);
    expect(local[0].type).toBe('unknown');
    expect(local[0].id).toBe('bad');
  });

  it('respects maxItems cap', () => {
    const lessonsDir = join(cwd, '.forge', 'lessons');
    mkdirSync(lessonsDir, { recursive: true });
    for (let i = 0; i < 5; i += 1) {
      writeFileSync(
        join(lessonsDir, `lesson-${i}.md`),
        `# LESSON: L${i}\nType: pattern\n\n## Applies when\nanywhere\n`,
      );
    }
    const brief = buildLessonsBrief({ cwd, globalDir, maxItems: 2 });
    expect(brief).toHaveLength(2);
  });

  it('initializeLessonsBrief is an alias over buildLessonsBrief', () => {
    const a = initializeLessonsBrief(cwd, { globalDir });
    const b = buildLessonsBrief({ cwd, globalDir });
    expect(a).toEqual(b);
  });

  it('reports local and global directories', () => {
    const dirs = getLessonDirectories(cwd, { globalDir });
    expect(dirs.local).toBe(join(cwd, '.forge/lessons'));
    expect(dirs.global).toBe(globalDir);
  });
});
