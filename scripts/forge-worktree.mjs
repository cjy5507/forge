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
  node scripts/forge-worktree.mjs pre-merge [--json]
  node scripts/forge-worktree.mjs merge-lane --lane <lane> [--message <msg>] [--no-rebase]
  node scripts/forge-worktree.mjs --help

Commands:
  create      create a lane worktree under .forge/worktrees by default
  list        list active Forge worktrees
  remove      remove a Forge worktree by lane id or explicit path
  prune       prune stale git worktree metadata
  pre-merge   check all worktrees for uncommitted changes and auto-commit them
  merge-lane  commit worktree changes, merge lane branch to main, rebase remaining worktrees

Options:
  --lane      lane identifier used for the default worktree path
  --branch    branch to create for the worktree
  --path      explicit worktree path (default: .forge/worktrees/<lane>)
  --base      starting ref for create (default: HEAD)
  --message   commit message for pre-merge auto-commit (default: "feat: {lane} implementation")
  --no-rebase skip rebasing other worktrees after merge
  --json      emit list output as JSON
  --force     force removal
  --help      show this message
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

    if (arg === '--no-rebase') {
      options.noRebase = true;
      continue;
    }

    if (['--lane', '--branch', '--path', '--base', '--message'].includes(arg)) {
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
      } else if (arg === '--message') {
        options.message = value.trim();
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

function assertForgeWorktreePath(worktreePath) {
  const forgeRoot = resolve('.forge', 'worktrees');
  if (worktreePath !== forgeRoot && !worktreePath.startsWith(`${forgeRoot}${sep}`)) {
    fail(`Worktree path must be under .forge/worktrees/: ${worktreePath}`);
  }
}

function createWorktree(options) {
  if (!options.branch) {
    fail('Expected --branch for create');
  }

  const worktreePath = resolveWorktreePath(options);
  assertForgeWorktreePath(worktreePath);

  if (existsSync(worktreePath)) {
    fail(`Worktree already exists at: ${worktreePath}`);
  }

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

function findWorktreeBranch(worktreePath) {
  const fullPath = resolve(worktreePath);
  const entries = parseWorktreeList(runGit(['worktree', 'list', '--porcelain']));
  const match = entries.find(e => e.path === fullPath);
  return match?.branch || '';
}

function tryDeleteBranch(branch) {
  if (!branch || branch === 'main' || branch === 'master') return false;
  const result = spawnSync('git', ['branch', '-d', branch], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return result.status === 0;
}

function removeWorktree(options) {
  const worktreePath = resolveWorktreePath(options);
  if (!existsSync(worktreePath)) {
    fail(`Worktree path does not exist: ${worktreePath}`);
  }

  const branch = findWorktreeBranch(worktreePath);

  const args = ['worktree', 'remove'];
  if (options.force) {
    args.push('--force');
  }
  args.push(worktreePath);
  runGit(args);

  console.log(`removed: ${worktreePath}`);

  if (branch && tryDeleteBranch(branch)) {
    console.log(`branch deleted: ${branch}`);
  }
}

function pruneWorktrees() {
  runGit(['worktree', 'prune']);
  console.log('pruned: git worktree metadata');
}

function runGitIn(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) {
    fail(result.error.message);
  }
  return result;
}

function getWorktreeStatus(worktreePath) {
  const result = runGitIn(worktreePath, ['status', '--porcelain']);
  if (result.status !== 0) {
    return { error: (result.stderr || '').trim() };
  }
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  return { dirty: lines.length > 0, files: lines };
}

function getWorktreeBranch(worktreePath) {
  const result = runGitIn(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function preMerge(options) {
  const entries = parseWorktreeList(runGit(['worktree', 'list', '--porcelain']))
    .filter(isForgeWorktree);

  if (entries.length === 0) {
    console.log('No Forge worktrees found.');
    return;
  }

  const results = [];

  for (const entry of entries) {
    const lane = entry.path.split(sep).pop();
    const status = getWorktreeStatus(entry.path);

    if (status.error) {
      results.push({ lane, path: entry.path, status: 'error', detail: status.error });
      continue;
    }

    if (!status.dirty) {
      results.push({ lane, path: entry.path, status: 'clean', committed: false });
      continue;
    }

    const msg = options.message || `feat: ${lane} implementation`;
    const addResult = runGitIn(entry.path, ['add', '-A']);
    if (addResult.status !== 0) {
      results.push({ lane, path: entry.path, status: 'error', detail: 'git add failed' });
      continue;
    }

    const commitResult = runGitIn(entry.path, ['commit', '-m', msg]);
    if (commitResult.status !== 0) {
      results.push({ lane, path: entry.path, status: 'error', detail: (commitResult.stderr || '').trim() });
      continue;
    }

    results.push({ lane, path: entry.path, status: 'committed', files: status.files.length });
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const r of results) {
    const icon = r.status === 'committed' ? '✓' : r.status === 'clean' ? '-' : '✗';
    const detail = r.status === 'committed' ? `${r.files} file(s) committed`
      : r.status === 'clean' ? 'already committed'
      : r.detail;
    console.log(`${icon} ${r.lane}: ${detail}`);
  }
}

function mergeLane(options) {
  if (!options.lane) {
    fail('Expected --lane for merge-lane');
  }

  const worktreePath = resolveWorktreePath(options);
  if (!existsSync(worktreePath)) {
    fail(`Worktree path does not exist: ${worktreePath}`);
  }

  const laneBranch = getWorktreeBranch(worktreePath);
  if (!laneBranch) {
    fail(`Cannot determine branch for worktree: ${worktreePath}`);
  }

  // Step 1: Commit uncommitted changes in the worktree
  const status = getWorktreeStatus(worktreePath);
  if (status.error) {
    fail(`Cannot read worktree status: ${status.error}`);
  }

  if (status.dirty) {
    const msg = options.message || `feat: ${options.lane} implementation`;
    const addResult = runGitIn(worktreePath, ['add', '-A']);
    if (addResult.status !== 0) {
      fail('git add failed in worktree');
    }
    const commitResult = runGitIn(worktreePath, ['commit', '-m', msg]);
    if (commitResult.status !== 0) {
      fail(`commit failed: ${(commitResult.stderr || '').trim()}`);
    }
    console.log(`committed: uncommitted changes in ${options.lane}`);
  }

  // Step 2: Merge lane branch into main
  const mergeResult = runGitIn(process.cwd(), ['merge', laneBranch, '--no-ff', '-m', `merge: ${options.lane} lane into main`]);
  if (mergeResult.status !== 0) {
    const stderr = (mergeResult.stderr || mergeResult.stdout || '').trim();
    fail(`merge failed for ${laneBranch}: ${stderr}\nResolve conflicts manually, then re-run.`);
  }
  console.log(`merged: ${laneBranch} → main`);

  // Step 3: Clean up the merged worktree and branch
  const removeResult = spawnSync('git', ['worktree', 'remove', resolve(worktreePath)], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (removeResult.status === 0) {
    console.log(`worktree removed: ${worktreePath}`);
    if (tryDeleteBranch(laneBranch)) {
      console.log(`branch deleted: ${laneBranch}`);
    }
  } else {
    console.log(`worktree retained: ${(removeResult.stderr || '').trim() || 'remove failed'}`);
  }

  // Step 4: Rebase remaining active worktrees
  if (options.noRebase) {
    console.log('skipped: rebase (--no-rebase)');
    return;
  }

  const remaining = parseWorktreeList(runGit(['worktree', 'list', '--porcelain']))
    .filter(isForgeWorktree)
    .filter(e => e.path !== resolve(worktreePath));

  if (remaining.length === 0) {
    console.log('no remaining worktrees to rebase');
    return;
  }

  for (const entry of remaining) {
    const lane = entry.path.split(sep).pop();
    const rebaseResult = runGitIn(entry.path, ['rebase', 'main']);
    if (rebaseResult.status !== 0) {
      // Abort failed rebase so the worktree isn't stuck
      runGitIn(entry.path, ['rebase', '--abort']);
      console.log(`✗ ${lane}: rebase conflict — manually rebase and resolve`);
    } else {
      console.log(`✓ ${lane}: rebased onto main`);
    }
  }
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

  if (command === 'pre-merge') {
    preMerge(options);
    return;
  }

  if (command === 'merge-lane') {
    mergeLane(options);
    return;
  }

  fail(`Unknown command: ${command}`);
}

main();
