#!/usr/bin/env node

import { existsSync } from 'fs';
import { resolve, sep } from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_BASE = 'HEAD';

function printUsage() {
  console.log(`Forge worktree helper

Usage:
  node scripts/forge-worktree.mjs create --lane <lane> --branch <branch> [--path <path>] [--base <ref>]
  node scripts/forge-worktree.mjs list [--json]
  node scripts/forge-worktree.mjs remove (--lane <lane> | --path <path>) [--force]
  node scripts/forge-worktree.mjs prune
  node scripts/forge-worktree.mjs --help

Commands:
  create   create a lane worktree under .forge/worktrees by default
  list     list active Forge worktrees
  remove   remove a Forge worktree by lane id or explicit path
  prune    prune stale git worktree metadata

Options:
  --lane    lane identifier used for the default worktree path
  --branch  branch to create for the worktree
  --path    explicit worktree path (default: .forge/worktrees/<lane>)
  --base    starting ref for create (default: HEAD)
  --json    emit list output as JSON
  --force   force removal
  --help    show this message
`);
}

function fail(message) {
  process.stderr.write(`[forge worktree] ${message}\n`);
  process.exit(1);
}

function sanitizeLane(value) {
  const lane = String(value || '').trim();
  if (!lane) {
    return '';
  }

  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(lane) || lane.includes('..')) {
    fail(`Invalid lane id: ${value}`);
  }

  return lane;
}

function parseArgs(argv) {
  const options = {
    force: false,
    json: false,
  };

  if (argv.length === 0 || argv.includes('--help')) {
    return { command: 'help', options };
  }

  const [command, ...rest] = argv;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (['--lane', '--branch', '--path', '--base'].includes(arg)) {
      const value = rest[index + 1];
      if (!value) {
        fail(`Missing value for ${arg}`);
      }
      index += 1;

      if (arg === '--lane') {
        options.lane = sanitizeLane(value);
      } else if (arg === '--branch') {
        options.branch = value.trim();
      } else if (arg === '--path') {
        options.path = resolve(value);
      } else if (arg === '--base') {
        options.base = value.trim();
      }
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  return { command, options };
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || 'git command failed').trim();
    fail(message);
  }

  return result.stdout;
}

function resolveWorktreePath(options) {
  if (options.path) {
    return options.path;
  }

  if (!options.lane) {
    fail('Expected --lane when --path is not provided');
  }

  return resolve('.forge', 'worktrees', options.lane);
}

function parseWorktreeList(output) {
  const lines = String(output || '').split('\n');
  const entries = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      if (current) {
        entries.push(current);
        current = null;
      }
      continue;
    }

    const spaceIndex = line.indexOf(' ');
    const key = spaceIndex === -1 ? line : line.slice(0, spaceIndex);
    const value = spaceIndex === -1 ? '' : line.slice(spaceIndex + 1);

    if (key === 'worktree') {
      if (current) {
        entries.push(current);
      }
      current = {
        path: resolve(value),
        branch: '',
        head: '',
        detached: false,
        locked: false,
        prunable: false,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (key === 'branch') {
      current.branch = value.replace(/^refs\/heads\//, '');
    } else if (key === 'HEAD') {
      current.head = value;
    } else if (key === 'detached') {
      current.detached = true;
    } else if (key === 'locked') {
      current.locked = true;
    } else if (key === 'prunable') {
      current.prunable = true;
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
}

function isForgeWorktree(entry) {
  const forgeRoot = resolve('.forge', 'worktrees');
  return entry.path === forgeRoot || entry.path.startsWith(`${forgeRoot}${sep}`);
}

function createWorktree(options) {
  if (!options.branch) {
    fail('Expected --branch for create');
  }

  const worktreePath = resolveWorktreePath(options);
  const baseRef = options.base || DEFAULT_BASE;
  runGit(['worktree', 'add', worktreePath, '-b', options.branch, baseRef]);

  console.log(`created: ${worktreePath}`);
  console.log(`branch: ${options.branch}`);
  console.log(`base: ${baseRef}`);
}

function listWorktrees(options) {
  const entries = parseWorktreeList(runGit(['worktree', 'list', '--porcelain']))
    .filter(isForgeWorktree);

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log('No Forge worktrees found.');
    return;
  }

  for (const entry of entries) {
    console.log(entry.path);
    console.log(`  branch: ${entry.branch || '(detached)'}`);
    console.log(`  head: ${entry.head || '(unknown)'}`);
    console.log(`  state: ${entry.prunable ? 'prunable' : entry.locked ? 'locked' : 'active'}`);
  }
}

function removeWorktree(options) {
  const worktreePath = resolveWorktreePath(options);
  if (!existsSync(worktreePath)) {
    fail(`Worktree path does not exist: ${worktreePath}`);
  }

  const args = ['worktree', 'remove'];
  if (options.force) {
    args.push('--force');
  }
  args.push(worktreePath);
  runGit(args);

  console.log(`removed: ${worktreePath}`);
}

function pruneWorktrees() {
  runGit(['worktree', 'prune']);
  console.log('pruned: git worktree metadata');
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    printUsage();
    return;
  }

  if (command === 'create') {
    createWorktree(options);
    return;
  }

  if (command === 'list') {
    listWorktrees(options);
    return;
  }

  if (command === 'remove') {
    removeWorktree(options);
    return;
  }

  if (command === 'prune') {
    pruneWorktrees();
    return;
  }

  fail(`Unknown command: ${command}`);
}

main();
