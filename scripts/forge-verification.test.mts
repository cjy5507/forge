import { mkdirSync, readFileSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { recordVerificationState } from './lib/forge-session.mjs';
import { readVerificationArtifact } from './lib/forge-verification.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const WORKSPACES: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-verification-'));
  WORKSPACES.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

afterEach(() => {
  while (WORKSPACES.length > 0) {
    rmSync(WORKSPACES.pop()!, { recursive: true, force: true });
  }
});

describe('forge verification surface', () => {
  it('writes and reads the verification artifact', () => {
    const cwd = makeWorkspace();
    recordVerificationState(cwd, {
      updated_at: new Date().toISOString(),
      edited_files: ['src/app.ts'],
      lane_refs: ['app'],
      selected_checks: [{ id: 'lint', reason: 'edited source files', command: 'npm run lint' }],
      status: 'passed',
      summary: 'Passed: lint.',
    });

    const artifact = readVerificationArtifact(cwd);
    expect(artifact?.status).toBe('passed');
    expect(artifact?.lane_refs).toContain('app');
    expect(artifact?.selected_checks?.[0]?.id).toBe('lint');
  });

  it('prints structured json from the CLI', () => {
    const cwd = makeWorkspace();
    recordVerificationState(cwd, {
      updated_at: new Date().toISOString(),
      edited_files: ['src/app.ts'],
      selected_checks: [{ id: 'lint', reason: 'edited source files', command: 'npm run lint' }],
      status: 'failed',
      summary: 'lint failed',
    });

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-verification.mjs'), '--json'], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.status).toBe('failed');
  });

  it('records the artifact path in recordVerificationState', () => {
    const cwd = makeWorkspace();
    const result = recordVerificationState(cwd, {
      updated_at: new Date().toISOString(),
      edited_files: [],
      selected_checks: [],
      status: 'planned',
      summary: 'Planned checks.',
    });

    expect(result.artifact_path).toContain('.forge/evidence/verification-latest.json');
    expect(readFileSync(result.artifact_path, 'utf8')).toContain('Planned checks.');
  });
});
