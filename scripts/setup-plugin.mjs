import { cpSync, existsSync, mkdirSync, lstatSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = dirname(SCRIPT_DIR);
const IGNORED_NAMES = new Set(['.git', 'node_modules', '.forge']);
const ALLOWED_HIDDEN_DIRS = new Set(['.claude-plugin', '.codex-plugin']);

function printUsage() {
  console.log(`Forge setup

Usage:
  node scripts/setup-plugin.mjs --scope global [--mode symlink|copy] [--target <dir>] [--force]
  node scripts/setup-plugin.mjs --scope project [--project-root <dir>] [--mode symlink|copy] [--target <dir>] [--force]

Options:
  --scope         global | project
  --mode          symlink | copy   (default: symlink)
  --target        explicit plugin install target
  --project-root  project root used for project scope (default: current working directory)
  --force         replace an existing target
  --help          show this message
`);
}

function parseArgs(argv) {
  const options = {
    mode: 'symlink',
    force: false,
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

    if (arg === '--scope' || arg === '--mode' || arg === '--target' || arg === '--project-root') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;

      if (arg === '--scope') {
        options.scope = value;
      } else if (arg === '--mode') {
        options.mode = value;
      } else if (arg === '--target') {
        options.target = value;
      } else if (arg === '--project-root') {
        options.projectRoot = value;
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
          if (topLevel && topLevel.startsWith('.') && !ALLOWED_HIDDEN_DIRS.has(topLevel) && rel === topLevel) {
            return false;
          }
        }
      }

      return true;
    },
  });
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const targetPath = resolveTarget(options);
  ensureSafeTarget(targetPath);

  if (existsSync(targetPath) && !options.force) {
    throw new Error(`Target already exists: ${targetPath}. Re-run with --force to replace it.`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  removeTarget(targetPath);

  if (options.mode === 'copy') {
    installByCopy(targetPath);
  } else {
    installBySymlink(targetPath);
  }

  const pluginRoot = existsSync(targetPath) ? realpathSync(targetPath) : targetPath;

  console.log(`Forge installed`);
  console.log(`scope: ${options.scope}`);
  console.log(`mode: ${options.mode}`);
  console.log(`target: ${targetPath}`);
  console.log(`source: ${pluginRoot}`);
  console.log(`layout: ${describeTarget(targetPath)}`);
  console.log(`next: point your plugin host at ${targetPath}`);
}

try {
  main();
} catch (error) {
  console.error(`[forge setup] ${error.message}`);
  process.exit(1);
}
