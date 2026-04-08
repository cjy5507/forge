import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';

const MARKETPLACE_RELATIVE_PATH = ['.codex', '.tmp', 'plugins', '.agents', 'plugins', 'marketplace.json'];
const PLUGINS_DIR_RELATIVE_PATH = ['.codex', '.tmp', 'plugins', 'plugins'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function shouldRegisterForgeInCodex(host = '') {
  return host === 'all' || host === 'codex';
}

export function getCodexMarketplaceManifestPath(homeDir = homedir()) {
  return join(homeDir, ...MARKETPLACE_RELATIVE_PATH);
}

export function getCodexMarketplacePluginsDir(homeDir = homedir()) {
  return join(homeDir, ...PLUGINS_DIR_RELATIVE_PATH);
}

function ensureMarketplaceManifest(homeDir = homedir()) {
  const manifestPath = getCodexMarketplaceManifestPath(homeDir);
  mkdirSync(dirname(manifestPath), { recursive: true });

  if (!existsSync(manifestPath)) {
    writeJson(manifestPath, {
      name: 'local',
      interface: {
        displayName: 'Local plugins',
      },
      plugins: [],
    });
  }

  return manifestPath;
}

export function registerForgeInCodexMarketplace({
  homeDir = homedir(),
  pluginRoot,
} = {}) {
  const manifestPath = ensureMarketplaceManifest(homeDir);
  const pluginsDir = getCodexMarketplacePluginsDir(homeDir);
  mkdirSync(pluginsDir, { recursive: true });

  const manifest = readJson(manifestPath);
  const plugins = Array.isArray(manifest.plugins) ? manifest.plugins : [];
  const existingIndex = plugins.findIndex(plugin => plugin?.name === 'forge');
  const nextEntry = {
    name: 'forge',
    source: {
      source: 'local',
      path: './plugins/forge',
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'NONE',
    },
    category: 'Coding',
  };

  if (existingIndex >= 0) {
    plugins[existingIndex] = {
      ...plugins[existingIndex],
      ...nextEntry,
    };
  } else {
    plugins.push(nextEntry);
  }

  manifest.plugins = plugins;
  writeJson(manifestPath, manifest);

  const targetPath = join(pluginsDir, 'forge');
  if (existsSync(targetPath)) {
    const stats = lstatSync(targetPath);
    if (stats.isSymbolicLink() || stats.isDirectory()) {
      rmSync(targetPath, { recursive: true, force: true });
    }
  }

  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(resolve(pluginRoot), targetPath, linkType);

  return {
    manifestPath,
    pluginLinkPath: targetPath,
  };
}
