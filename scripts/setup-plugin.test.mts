import { existsSync, lstatSync, readFileSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const SETUP_SCRIPT = join(FORGE_ROOT, 'scripts', 'setup-plugin.mjs');

function runSetup(args = [], options = {}) {
  return spawnSync(process.execPath, [SETUP_SCRIPT, ...args], {
    cwd: options.cwd || FORGE_ROOT,
    encoding: 'utf8',
  });
}

describe('forge setup installer', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('creates a project-local symlink install by default', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-project-'));
    tmpDirs.push(projectRoot);
    const target = join(projectRoot, '.forge', 'plugins', 'forge');

    const result = runSetup(['--scope', 'project', '--project-root', projectRoot]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(`target: ${target}`);
    expect(existsSync(target)).toBe(true);
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
  });

  it('can copy the plugin into a project-local target', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-project-copy-'));
    tmpDirs.push(projectRoot);
    const target = join(projectRoot, '.forge', 'plugins', 'forge');

    const result = runSetup([
      '--scope',
      'project',
      '--project-root',
      projectRoot,
      '--mode',
      'copy',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(existsSync(join(target, '.codex-plugin', 'plugin.json'))).toBe(true);
    expect(existsSync(join(target, '.mcp.json'))).toBe(true);
    expect(existsSync(join(target, 'hooks', 'hooks.json'))).toBe(true);
    expect(existsSync(join(target, '.git'))).toBe(false);
    expect(existsSync(join(target, 'node_modules'))).toBe(false);
    expect(existsSync(join(target, '.forge'))).toBe(false);
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
  });

  it('requires --force when the target already exists', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-project-force-'));
    tmpDirs.push(projectRoot);
    const target = join(projectRoot, '.forge', 'plugins', 'forge');

    const first = runSetup(['--scope', 'project', '--project-root', projectRoot]);
    expect(first.status).toBe(0);

    const second = runSetup(['--scope', 'project', '--project-root', projectRoot]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('Target already exists');

    const forced = runSetup([
      '--scope',
      'project',
      '--project-root',
      projectRoot,
      '--force',
    ]);
    expect(forced.status).toBe(0);
    expect(existsSync(target)).toBe(true);
  });

  it('prints help text', () => {
    const result = runSetup(['--help']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--scope global');
  });

  it('documents the installer in the README quick start', () => {
    const readme = readFileSync(join(FORGE_ROOT, 'README.md'), 'utf8');

    expect(readme).toContain('## Quick start');
    expect(readme).toContain('scripts/setup-plugin.mjs');
    expect(readme).toContain('--scope global');
    expect(readme).toContain('--scope project');
  });
});
