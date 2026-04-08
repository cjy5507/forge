import { existsSync, lstatSync, readFileSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const BOOTSTRAP_SCRIPT = join(FORGE_ROOT, 'scripts', 'bootstrap-install.mjs');

function runBootstrap(args = []) {
  return spawnSync(process.execPath, [BOOTSTRAP_SCRIPT, ...args], {
    cwd: FORGE_ROOT,
    encoding: 'utf8',
  });
}

describe('forge bootstrap installer', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('can bootstrap a project-local install from a local source directory', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-bootstrap-project-'));
    tmpDirs.push(projectRoot);
    const checkout = join(projectRoot, '.forge', 'vendor', 'forge');
    const target = join(projectRoot, '.forge', 'plugins', 'forge');

    const result = runBootstrap([
      '--scope',
      'project',
      '--project-root',
      projectRoot,
      '--source',
      FORGE_ROOT,
      '--force',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Forge bootstrap complete');
    expect(result.stdout).toContain(`checkout: ${checkout}`);
    expect(existsSync(checkout)).toBe(true);
    expect(lstatSync(checkout).isSymbolicLink()).toBe(true);
    expect(existsSync(target)).toBe(true);
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
  });

  it('passes copy mode through to setup-plugin', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-bootstrap-copy-'));
    tmpDirs.push(projectRoot);
    const target = join(projectRoot, '.forge', 'plugins', 'forge');

    const result = runBootstrap([
      '--scope',
      'project',
      '--project-root',
      projectRoot,
      '--source',
      FORGE_ROOT,
      '--mode',
      'copy',
      '--force',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(existsSync(join(target, '.codex-plugin', 'plugin.json'))).toBe(true);
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
  });

  it('passes selective setup options through to setup-plugin', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-bootstrap-selective-'));
    tmpDirs.push(projectRoot);
    const target = join(projectRoot, '.forge', 'plugins', 'forge');

    const result = runBootstrap([
      '--scope',
      'project',
      '--project-root',
      projectRoot,
      '--source',
      FORGE_ROOT,
      '--mode',
      'copy',
      '--profile',
      'minimal',
      '--host',
      'codex',
      '--force',
    ]);

    expect(result.status).toBe(0);
    expect(existsSync(join(target, '.codex-plugin', 'plugin.json'))).toBe(true);
    expect(existsSync(join(target, '.claude-plugin'))).toBe(false);
    expect(result.stdout).toContain('profile: minimal');
    expect(result.stdout).toContain('host: codex');
  });

  it('documents the curl bootstrap flow in the README quick start', () => {
    const readme = readFileSync(join(FORGE_ROOT, 'README.md'), 'utf8');

    expect(readme).toContain('curl -fsSL');
    expect(readme).toContain('bootstrap-install.mjs');
    expect(readme).toContain('--input-type=module -');
  });
});
