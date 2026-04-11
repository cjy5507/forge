import { cpSync, existsSync, mkdirSync, lstatSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { getForgeAllowedHiddenTopLevelEntries } from './lib/forge-host.mjs';
import {
  describeSetupSelection,
  getForgeInstallStateFileName,
  getForgeSetupHosts,
  getForgeSetupProfiles,
  isSelectiveSetup,
  normalizeSetupHost,
  normalizeSetupProfile,
  resolveSetupSelection,
  validateSetupSelection,
} from './lib/forge-setup-manifest.mjs';
import { registerForgeInCodexMarketplace, shouldRegisterForgeInCodex } from './lib/forge-codex-marketplace.mjs';
import { writeJsonFile } from './lib/forge-io.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = dirname(SCRIPT_DIR);
const IGNORED_NAMES = new Set(['.git', 'node_modules', '.forge']);
const ALLOWED_HIDDEN_TOP_LEVEL_ENTRIES = new Set(getForgeAllowedHiddenTopLevelEntries());

function printUsage() {
  console.log(`Forge setup

Usage:
  node scripts/setup-plugin.mjs --scope global [--mode symlink|copy] [--target <dir>] [--profile <${getForgeSetupProfiles().join('|')}>] [--host <${getForgeSetupHosts().join('|')}>] [--dry-run] [--force]
  node scripts/setup-plugin.mjs --scope project [--project-root <dir>] [--mode symlink|copy] [--target <dir>] [--profile <${getForgeSetupProfiles().join('|')}>] [--host <${getForgeSetupHosts().join('|')}>] [--dry-run] [--force]

Options:
  --scope         global | project
  --mode          symlink | copy   (default: symlink)
  --target        explicit plugin install target
  --project-root  project root used for project scope (default: current working directory)
  --profile       full | runtime | minimal   (default: full)
  --host          all | claude | codex | gemini | qwen   (default: all)
  --dry-run       print the resolved install plan without mutating the target
  --force         replace an existing target
  --help          show this message
`);
}

function parseArgs(argv) {
  const options = {
    mode: 'symlink',
    modeExplicit: false,
    force: false,
    host: 'all',
    profile: 'full',
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--scope' || arg === '--mode' || arg === '--target' || arg === '--project-root' || arg === '--profile' || arg === '--host') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;

      if (arg === '--scope') {
        options.scope = value;
      } else if (arg === '--mode') {
        options.mode = value;
        options.modeExplicit = true;
      } else if (arg === '--target') {
        options.target = value;
      } else if (arg === '--project-root') {
        options.projectRoot = value;
      } else if (arg === '--profile') {
        options.profile = value;
      } else if (arg === '--host') {
        options.host = value;
      }
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }

  if (options.scope !== 'global' && options.scope !== 'project') {
    throw new Error('Expected --scope global or --scope project');
  }

  if (options.mode !== 'symlink' && options.mode !== 'copy') {
    throw new Error('Expected --mode symlink or --mode copy');
  }

  options.profile = normalizeSetupProfile(options.profile);
  options.host = normalizeSetupHost(options.host);

  if (!options.modeExplicit && isSelectiveSetup({ profile: options.profile, host: options.host })) {
    options.mode = 'copy';
  }

  return options;
}

function isWithinPath(candidate, parent) {
  const rel = relative(parent, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function resolveTarget(options) {
  if (options.target) {
    return resolve(options.target);
  }

  if (options.scope === 'global') {
    return resolve(homedir(), '.forge', 'plugins', 'forge');
  }

  const projectRoot = resolve(options.projectRoot || process.cwd());
  return join(projectRoot, '.forge', 'plugins', 'forge');
}

function ensureSafeTarget(targetPath) {
  if (targetPath === SOURCE_ROOT) {
    throw new Error('Target path cannot be the Forge source directory itself');
  }

  if (isWithinPath(targetPath, SOURCE_ROOT)) {
    throw new Error('Target path cannot be inside the Forge source directory');
  }
}

function removeTarget(targetPath) {
  if (!existsSync(targetPath)) {
    return;
  }

  rmSync(targetPath, { recursive: true, force: true });
}

function installByCopy(targetPath) {
  cpSync(SOURCE_ROOT, targetPath, {
    recursive: true,
    filter(sourcePath) {
      const name = basename(sourcePath);
      if (IGNORED_NAMES.has(name)) {
        return false;
      }

      if (sourcePath !== SOURCE_ROOT) {
        const rel = relative(SOURCE_ROOT, sourcePath);
        if (!rel.startsWith('..')) {
          const [topLevel] = rel.split(/[\\/]/);
          if (topLevel && topLevel.startsWith('.') && !ALLOWED_HIDDEN_TOP_LEVEL_ENTRIES.has(topLevel) && rel === topLevel) {
            return false;
          }
        }
      }

      return true;
    },
  });
}

function installSelectedEntries(targetPath, selection) {
  const entries = [...selection.visibleEntries, ...selection.hiddenEntries];
  for (const entry of entries) {
    const sourcePath = join(SOURCE_ROOT, entry);
    if (!existsSync(sourcePath)) {
      throw new Error(`Selected entry is missing from source root: ${entry}`);
    }
    cpSync(sourcePath, join(targetPath, entry), {
      recursive: true,
    });
  }
}

function installBySymlink(targetPath) {
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(SOURCE_ROOT, targetPath, linkType);
}

function describeTarget(targetPath) {
  if (!existsSync(targetPath)) {
    return 'missing';
  }

  const stats = lstatSync(targetPath);
  if (stats.isSymbolicLink()) {
    return `symlink -> ${readlinkSync(targetPath)}`;
  }

  return 'directory copy';
}

function describeInstallPlan(options, targetPath, selection) {
  const describedSelection = describeSetupSelection(selection);
  const selective = isSelectiveSetup({ profile: options.profile, host: options.host });
  return {
    scope: options.scope,
    mode: options.mode,
    target: targetPath,
    profile: options.profile,
    host: options.host,
    selective,
    source: SOURCE_ROOT,
    entries: selective
      ? {
        visible: describedSelection.visibleEntries,
        hidden: describedSelection.hiddenEntries,
      }
      : {
        visible: ['*'],
        hidden: ['shared + all host surfaces'],
      },
  };
}

function writeInstallState(targetPath, options, selection) {
  const installStatePath = join(targetPath, getForgeInstallStateFileName());
  writeJsonFile(installStatePath, {
    version: 1,
    installed_at: new Date().toISOString(),
    scope: options.scope,
    mode: options.mode,
    profile: options.profile,
    host: options.host,
    selective: selection.selective,
    source_root: SOURCE_ROOT,
    included_entries: {
      visible: [...selection.visibleEntries],
      hidden: [...selection.hiddenEntries],
    },
  });
  return installStatePath;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const targetPath = resolveTarget(options);
  ensureSafeTarget(targetPath);
  const selection = resolveSetupSelection({ profile: options.profile, host: options.host });
  const selective = isSelectiveSetup({ profile: options.profile, host: options.host });

  if (selective) {
    const validation = validateSetupSelection(SOURCE_ROOT, selection);
    if (!validation.valid) {
      throw new Error(`Selective install references missing entries: ${validation.missingEntries.join(', ')}`);
    }
    if (options.mode !== 'copy') {
      throw new Error('Selective setup requires --mode copy so Forge can materialize only the chosen surfaces.');
    }
  }

  const plan = describeInstallPlan(options, targetPath, selection);
  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (existsSync(targetPath) && !options.force) {
    throw new Error(`Target already exists: ${targetPath}. Re-run with --force to replace it.`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  removeTarget(targetPath);

  if (options.mode === 'copy') {
    if (selective) {
      installSelectedEntries(targetPath, selection);
    } else {
      installByCopy(targetPath);
    }
  } else {
    installBySymlink(targetPath);
  }

  const pluginRoot = existsSync(targetPath) ? realpathSync(targetPath) : targetPath;
  const installStatePath = options.mode === 'copy'
    ? writeInstallState(targetPath, options, selection)
    : '';

  console.log(`Forge installed`);
  console.log(`scope: ${options.scope}`);
  console.log(`mode: ${options.mode}`);
  console.log(`target: ${targetPath}`);
  console.log(`source: ${pluginRoot}`);
  console.log(`profile: ${options.profile}`);
  console.log(`host: ${options.host}`);
  console.log(`selective: ${selective ? 'yes' : 'no'}`);
  console.log(`layout: ${describeTarget(targetPath)}`);
  if (installStatePath) {
    console.log(`install-state: ${installStatePath}`);
  }
  if (shouldRegisterForgeInCodex(options.host)) {
    try {
      const registration = registerForgeInCodexMarketplace({
        pluginRoot: targetPath,
      });
      console.log(`codex-marketplace: ${registration.manifestPath}`);
      console.log(`codex-plugin-link: ${registration.pluginLinkPath}`);
    } catch (error) {
      console.log(`codex-marketplace: skipped (${error.message})`);
    }
  }
  console.log(`next: point your plugin host at ${targetPath}`);
}

try {
  main();
} catch (error) {
  console.error(`[forge setup] ${error.message}`);
  process.exit(1);
}
