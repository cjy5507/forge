import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const SYNC_SCRIPT = join(FORGE_ROOT, 'scripts', 'sync-version.mjs');

function runSync(args = []) {
  return spawnSync(process.execPath, [SYNC_SCRIPT, ...args], {
    cwd: FORGE_ROOT,
    encoding: 'utf8',
  });
}

function seedVersionFixture(root, version, overrides = {}) {
  mkdirSync(join(root, '.codex-plugin'), { recursive: true });
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });

  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'forge', version }, null, 2)}\n`);
  writeFileSync(
    join(root, 'package-lock.json'),
    `${JSON.stringify({
      name: 'forge',
      version: overrides.packageLockVersion || '0.0.1',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'forge',
          version: overrides.packageEntryVersion || '0.0.1',
        },
      },
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, '.codex-plugin', 'plugin.json'),
    `${JSON.stringify({ name: 'forge', version: overrides.codexVersion || '0.0.1' }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, '.claude-plugin', 'plugin.json'),
    `${JSON.stringify({ name: 'forge', version: overrides.claudeVersion || '0.0.1' }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, '.claude-plugin', 'marketplace.json'),
    `${JSON.stringify({
      metadata: { version: overrides.marketplaceMetadataVersion || '0.0.1' },
      plugins: [{ name: 'forge', version: overrides.marketplacePluginVersion || '0.0.1' }],
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, 'gemini-extension.json'),
    `${JSON.stringify({ name: 'forge', version: overrides.geminiVersion || '0.0.1' }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, 'qwen-extension.json'),
    `${JSON.stringify({ name: 'forge', version: overrides.qwenVersion || '0.0.1' }, null, 2)}\n`,
  );
}

describe('forge version sync', () => {
  const tmpDirs = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('fails check mode when package-driven version metadata drifts', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-version-check-'));
    tmpDirs.push(root);
    seedVersionFixture(root, '1.2.3');

    const result = runSync(['--check', '--root', root]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Forge version drift detected against 1.2.3');
    expect(result.stderr).toContain('package-lock.json version');
    expect(result.stderr).toContain('.claude-plugin/marketplace.json metadata.version');
    expect(result.stderr).toContain('gemini-extension.json version');
    expect(result.stderr).toContain('qwen-extension.json version');
  });

  it('rewrites all published version metadata from package.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-version-write-'));
    tmpDirs.push(root);
    seedVersionFixture(root, '2.4.6');

    const result = runSync(['--root', root]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Synced Forge version metadata to 2.4.6');

    const packageLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    const codexManifest = JSON.parse(readFileSync(join(root, '.codex-plugin', 'plugin.json'), 'utf8'));
    const claudeManifest = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
    const marketplace = JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
    const geminiManifest = JSON.parse(readFileSync(join(root, 'gemini-extension.json'), 'utf8'));
    const qwenManifest = JSON.parse(readFileSync(join(root, 'qwen-extension.json'), 'utf8'));

    expect(packageLock.version).toBe('2.4.6');
    expect(packageLock.packages[''].version).toBe('2.4.6');
    expect(codexManifest.version).toBe('2.4.6');
    expect(claudeManifest.version).toBe('2.4.6');
    expect(marketplace.metadata.version).toBe('2.4.6');
    expect(marketplace.plugins[0].version).toBe('2.4.6');
    expect(geminiManifest.version).toBe('2.4.6');
    expect(qwenManifest.version).toBe('2.4.6');
  });

  it('passes check mode for the repository itself', () => {
    const result = runSync(['--check']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Forge versions are in sync at');
  });
});
