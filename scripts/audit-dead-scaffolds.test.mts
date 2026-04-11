import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SCRIPT_DIR);
const AUDITOR = join(ROOT, 'scripts', 'audit-dead-scaffolds.mjs');

function runAuditor(args: string[] = []) {
  return spawnSync(process.execPath, [AUDITOR, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

describe('audit-dead-scaffolds', () => {
  it('exits 0 on current tree (all fields alive or allowlisted)', () => {
    const result = runAuditor();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/audit-dead-scaffolds: \d+ fields/);
    expect(result.stdout).toMatch(/dead=0/);
  });

  it('emits JSON summary with --json', () => {
    const result = runAuditor(['--json']);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.total_fields).toBeGreaterThan(0);
    expect(parsed.summary.dead_scaffolds).toBe(0);
    expect(Array.isArray(parsed.dead)).toBe(true);
  });

  it('emits allowlisted array (currently empty)', () => {
    const result = runAuditor(['--json']);
    const parsed = JSON.parse(result.stdout);
    expect(Array.isArray(parsed.allowlisted)).toBe(true);
    expect(parsed.summary.allowlisted_dead).toBe(parsed.allowlisted.length);
  });

  it('skips ForgeLessonBrief fields (agent-facing content)', () => {
    // `prevention` lives in ForgeLessonBrief — skipped via SKIP_INTERFACES.
    // It should not show up as dead even though its only producer is object
    // literal construction in the loader with no code consumer.
    const result = runAuditor(['--json']);
    const parsed = JSON.parse(result.stdout);
    const deadFields = parsed.dead.map((e: { field: string }) => e.field);
    const allowedFields = parsed.allowlisted.map((e: { field: string }) => e.field);
    expect(deadFields).not.toContain('prevention');
    expect(allowedFields).not.toContain('prevention');
  });
});
