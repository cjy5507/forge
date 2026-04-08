import { existsSync, lstatSync, readFileSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { getForgePackagedPaths } from './lib/forge-host-catalog.mjs';
import { getForgeInstallStateFileName } from './lib/forge-setup-manifest.mjs';

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
    for (const relativePath of getForgePackagedPaths()) {
      expect(existsSync(join(target, relativePath))).toBe(true);
    }
    expect(existsSync(join(target, 'hooks', 'hooks.json'))).toBe(true);
    expect(existsSync(join(target, '.git'))).toBe(false);
    expect(existsSync(join(target, 'node_modules'))).toBe(false);
    expect(existsSync(join(target, '.forge'))).toBe(false);
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
  });

  it('supports selective copy installs for a single host profile', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-project-selective-'));
    tmpDirs.push(projectRoot);
    const target = join(projectRoot, '.forge', 'plugins', 'forge');

    const result = runSetup([
      '--scope',
      'project',
      '--project-root',
      projectRoot,
      '--mode',
      'copy',
      '--profile',
      'minimal',
      '--host',
      'codex',
    ]);

    expect(result.status).toBe(0);
    expect(existsSync(join(target, '.codex-plugin', 'plugin.json'))).toBe(true);
    expect(existsSync(join(target, '.claude-plugin'))).toBe(false);
    expect(existsSync(join(target, 'qwen-commands'))).toBe(false);
    expect(existsSync(join(target, getForgeInstallStateFileName()))).toBe(true);

    const installState = JSON.parse(readFileSync(join(target, getForgeInstallStateFileName()), 'utf8'));
    expect(installState.profile).toBe('minimal');
    expect(installState.host).toBe('codex');
    expect(installState.selective).toBe(true);
  });

  it('prints a dry-run plan for selective installs', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-project-plan-'));
    tmpDirs.push(projectRoot);
    const target = join(projectRoot, '.forge', 'plugins', 'forge');

    const result = runSetup([
      '--scope',
      'project',
      '--project-root',
      projectRoot,
      '--mode',
      'copy',
      '--profile',
      'runtime',
      '--host',
      'gemini',
      '--dry-run',
    ]);

    expect(result.status).toBe(0);
    expect(existsSync(target)).toBe(false);
    const plan = JSON.parse(result.stdout);
    expect(plan.profile).toBe('runtime');
    expect(plan.host).toBe('gemini');
    expect(plan.selective).toBe(true);
  });

  it('rejects selective installs in symlink mode', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-project-selective-link-'));
    tmpDirs.push(projectRoot);

    const result = runSetup([
      '--scope',
      'project',
      '--project-root',
      projectRoot,
      '--profile',
      'minimal',
      '--host',
      'codex',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Selective setup requires --mode copy');
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
    expect(result.stdout).toContain('--profile');
    expect(result.stdout).toContain('--host');
  });

  it('documents the installer in the README quick start', () => {
    const readme = readFileSync(join(FORGE_ROOT, 'README.md'), 'utf8');

    expect(readme).toContain('## Quick start');
    expect(readme).toContain('scripts/setup-plugin.mjs');
    expect(readme).toContain('--scope global');
    expect(readme).toContain('--scope project');
    expect(readme).toContain('gemini extensions install');
    expect(readme).toContain('qwen extensions install');
  });
});
