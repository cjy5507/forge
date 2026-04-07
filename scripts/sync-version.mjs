import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = dirname(SCRIPT_DIR);

function printUsage() {
  console.log(`Forge version sync

Usage:
  node scripts/sync-version.mjs [--check] [--root <dir>]

Options:
  --check       validate manifests without writing changes
  --root        repository root to operate on (default: script parent)
  --help        show this message
`);
}

function parseArgs(argv) {
  const options = {
    check: false,
    root: DEFAULT_ROOT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--check') {
      options.check = true;
      continue;
    }

    if (arg === '--root') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --root');
      }
      options.root = resolve(value);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureVersionMatch(current, expected, label, drift) {
  if (current !== expected) {
    drift.push(`${label}: expected ${expected}, found ${current}`);
    return expected;
  }

  return current;
}

function syncRepositoryVersions(root, checkOnly) {
  const packageJsonPath = join(root, 'package.json');
  const packageLockPath = join(root, 'package-lock.json');
  const codexManifestPath = join(root, '.codex-plugin', 'plugin.json');
  const claudeManifestPath = join(root, '.claude-plugin', 'plugin.json');
  const marketplacePath = join(root, '.claude-plugin', 'marketplace.json');
  const geminiManifestPath = join(root, 'gemini-extension.json');
  const qwenManifestPath = join(root, 'qwen-extension.json');

  const pkg = readJson(packageJsonPath);
  const packageLock = readJson(packageLockPath);
  const codexManifest = readJson(codexManifestPath);
  const claudeManifest = readJson(claudeManifestPath);
  const marketplace = readJson(marketplacePath);
  const geminiManifest = readJson(geminiManifestPath);
  const qwenManifest = readJson(qwenManifestPath);
  const drift = [];

  packageLock.version = ensureVersionMatch(packageLock.version, pkg.version, 'package-lock.json version', drift);
  packageLock.packages = packageLock.packages || {};
  packageLock.packages[''] = packageLock.packages[''] || {};
  packageLock.packages[''].version = ensureVersionMatch(
    packageLock.packages[''].version,
    pkg.version,
    'package-lock.json packages[""].version',
    drift,
  );

  codexManifest.version = ensureVersionMatch(codexManifest.version, pkg.version, '.codex-plugin/plugin.json version', drift);
  claudeManifest.version = ensureVersionMatch(claudeManifest.version, pkg.version, '.claude-plugin/plugin.json version', drift);
  geminiManifest.version = ensureVersionMatch(geminiManifest.version, pkg.version, 'gemini-extension.json version', drift);
  qwenManifest.version = ensureVersionMatch(qwenManifest.version, pkg.version, 'qwen-extension.json version', drift);

  marketplace.metadata = marketplace.metadata || {};
  marketplace.metadata.version = ensureVersionMatch(
    marketplace.metadata.version,
    pkg.version,
    '.claude-plugin/marketplace.json metadata.version',
    drift,
  );

  marketplace.plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  marketplace.plugins.forEach((plugin, index) => {
    plugin.version = ensureVersionMatch(
      plugin.version,
      pkg.version,
      `.claude-plugin/marketplace.json plugins[${index}].version`,
      drift,
    );
  });

  if (checkOnly) {
    return { version: pkg.version, drift };
  }

  if (drift.length > 0) {
    writeJson(packageLockPath, packageLock);
    writeJson(codexManifestPath, codexManifest);
    writeJson(claudeManifestPath, claudeManifest);
    writeJson(marketplacePath, marketplace);
    writeJson(geminiManifestPath, geminiManifest);
    writeJson(qwenManifestPath, qwenManifest);
  }

  return { version: pkg.version, drift };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const result = syncRepositoryVersions(options.root, options.check);

  if (options.check) {
    if (result.drift.length > 0) {
      console.error(`Forge version drift detected against ${result.version}`);
      for (const entry of result.drift) {
        console.error(`- ${entry}`);
      }
      process.exit(1);
    }

    console.log(`Forge versions are in sync at ${result.version}`);
    return;
  }

  if (result.drift.length === 0) {
    console.log(`Forge versions already in sync at ${result.version}`);
    return;
  }

  console.log(`Synced Forge version metadata to ${result.version}`);
  for (const entry of result.drift) {
    console.log(`- ${entry}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[forge version sync] ${error.message}`);
  process.exit(1);
}
