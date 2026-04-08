import { existsSync, mkdirSync, rmSync, symlinkSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_REPO = 'https://github.com/cjy5507/forge.git';

function printUsage() {
  console.log(`Forge bootstrap installer

Usage:
  node scripts/bootstrap-install.mjs --scope global [--mode symlink|copy] [--source <git-url-or-dir>] [--checkout-dir <dir>] [--target <dir>] [--profile <full|runtime|minimal>] [--host <all|claude|codex|gemini|qwen>] [--dry-run] [--force]
  node scripts/bootstrap-install.mjs --scope project [--project-root <dir>] [--mode symlink|copy] [--source <git-url-or-dir>] [--checkout-dir <dir>] [--target <dir>] [--profile <full|runtime|minimal>] [--host <all|claude|codex|gemini|qwen>] [--dry-run] [--force]

Options:
  --scope         global | project
  --mode          symlink | copy   (default: symlink)
  --source        git URL or local Forge checkout (default: ${DEFAULT_REPO})
  --checkout-dir  where the Forge repo should be cloned when --source is a git URL
  --project-root  project root used for project scope (default: current working directory)
  --target        explicit plugin install target
  --profile       setup surface profile passed through to setup-plugin
  --host          host surface filter passed through to setup-plugin
  --dry-run       print the resolved setup plan without mutating the target
  --force         replace an existing checkout or target
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
    source: DEFAULT_REPO,
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

    if (
      arg === '--scope'
      || arg === '--mode'
      || arg === '--source'
      || arg === '--checkout-dir'
      || arg === '--project-root'
      || arg === '--target'
      || arg === '--profile'
      || arg === '--host'
    ) {
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
      } else if (arg === '--source') {
        options.source = value;
      } else if (arg === '--checkout-dir') {
        options.checkoutDir = value;
      } else if (arg === '--project-root') {
        options.projectRoot = value;
      } else if (arg === '--target') {
        options.target = value;
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

  return options;
}

function resolveProjectRoot(options) {
  return resolve(options.projectRoot || process.cwd());
}

function resolveCheckoutDir(options, projectRoot) {
  if (options.checkoutDir) {
    return resolve(options.checkoutDir);
  }

  if (options.scope === 'global') {
    return resolve(homedir(), '.forge', 'src', 'forge');
  }

  return join(projectRoot, '.forge', 'vendor', 'forge');
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    const details = stderr || stdout || `exit code ${result.status}`;
    throw new Error(`${label} failed: ${details}`);
  }

  return result;
}

function resolveSourceDir(options, checkoutDir) {
  const maybeLocalPath = resolve(options.source);
  if (existsSync(maybeLocalPath)) {
    if (options.scope !== 'project') {
      return maybeLocalPath;
    }

    if (maybeLocalPath === checkoutDir) {
      return checkoutDir;
    }

    if (existsSync(checkoutDir)) {
      if (!options.force) {
        throw new Error(`Checkout already exists: ${checkoutDir}. Re-run with --force to replace it.`);
      }
      rmSync(checkoutDir, { recursive: true, force: true });
    }

    mkdirSync(dirname(checkoutDir), { recursive: true });
    symlinkSync(maybeLocalPath, checkoutDir, process.platform === 'win32' ? 'junction' : 'dir');
    return checkoutDir;
  }

  if (existsSync(checkoutDir)) {
    if (!options.force) {
      throw new Error(`Checkout already exists: ${checkoutDir}. Re-run with --force to replace it.`);
    }
    rmSync(checkoutDir, { recursive: true, force: true });
  }

  mkdirSync(dirname(checkoutDir), { recursive: true });
  runCommand('git', ['clone', '--depth', '1', options.source, checkoutDir], 'git clone');
  return checkoutDir;
}

function runSetup(sourceDir, options, projectRoot) {
  const setupScript = join(sourceDir, 'scripts', 'setup-plugin.mjs');
  const args = [setupScript, '--scope', options.scope];

  if (options.modeExplicit || options.mode !== 'symlink') {
    args.push('--mode', options.mode);
  }

  if (options.scope === 'project') {
    args.push('--project-root', projectRoot);
  }

  if (options.target) {
    args.push('--target', resolve(options.target));
  }

  if (options.profile) {
    args.push('--profile', options.profile);
  }

  if (options.host) {
    args.push('--host', options.host);
  }

  if (options.dryRun) {
    args.push('--dry-run');
  }

  if (options.force) {
    args.push('--force');
  }

  const result = runCommand(process.execPath, args, 'setup-plugin');
  return result.stdout.trim();
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const projectRoot = resolveProjectRoot(options);
  const checkoutDir = resolveCheckoutDir(options, projectRoot);
  const sourceDir = resolveSourceDir(options, checkoutDir);
  const output = runSetup(sourceDir, options, projectRoot);

  console.log(`Forge bootstrap complete`);
  console.log(`scope: ${options.scope}`);
  console.log(`mode: ${options.mode}`);
  console.log(`source: ${options.source}`);
  console.log(`profile: ${options.profile}`);
  console.log(`host: ${options.host}`);
  if (sourceDir === checkoutDir) {
    console.log(`checkout: ${checkoutDir}`);
  } else {
    console.log(`checkout: skipped (using local source ${sourceDir})`);
  }
  console.log(output);
}

try {
  main();
} catch (error) {
  console.error(`[forge bootstrap] ${error.message}`);
  process.exit(1);
}
