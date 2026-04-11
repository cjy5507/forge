#!/usr/bin/env node

import { existsSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SCRIPT_DIR);
const JSON_TARGETS = [
  'package.json',
  'hooks/hooks.json',
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  '.codex-plugin/hooks/hooks.json',
  'gemini-extension.json',
  'qwen-extension.json',
];

function walkFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function fail(message) {
  process.stderr.write(`[forge lint] ${message}\n`);
  process.exit(1);
}

function isBinaryFile(filePath) {
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    const bytesRead = readSync(fd, buf, 0, 4, 0);
    if (bytesRead >= 4) {
      const magic = buf.readUInt32BE(0);
      // Mach-O magic: feedface, feedfacf, cafebabe, and their little-endian variants
      if (magic === 0xFEEDFACE || magic === 0xFEEDFACF || magic === 0xCAFEBABE || magic === 0xCEFAEDFE || magic === 0xCFFAEDFE) {
        return true;
      }
    }
  } catch {
    // If we can't read, let syntax check handle it
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return false;
}

function runSyntaxChecks() {
  const targets = [
    ...walkFiles(join(ROOT, 'scripts')),
    ...(existsSync(join(ROOT, 'hooks')) ? walkFiles(join(ROOT, 'hooks')) : []),
  ].filter(file => file.endsWith('.mjs') && !isBinaryFile(file));

  for (const file of targets) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      fail(`Syntax check failed for ${file}\n${result.stderr || result.stdout}`.trim());
    }
  }

  return targets.length;
}

function validateJsonManifests() {
  let count = 0;

  for (const relativePath of JSON_TARGETS) {
    const fullPath = join(ROOT, relativePath);
    if (!existsSync(fullPath)) {
      continue;
    }
    JSON.parse(readFileSync(fullPath, 'utf8'));
    count += 1;
  }

  return count;
}

function validatePackageEntrypoints() {
  const packagePath = join(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));

  for (const scriptName of ['lint', 'typecheck', 'test']) {
    if (typeof pkg.scripts?.[scriptName] !== 'string' || !pkg.scripts[scriptName]) {
      fail(`package.json is missing scripts.${scriptName}`);
    }
  }

  if (!pkg.bin || typeof pkg.bin !== 'object') {
    fail('package.json is missing a bin map');
  }

  const bins = Object.entries(pkg.bin);
  if (bins.length === 0) {
    fail('package.json bin map is empty');
  }

  for (const [name, relativePath] of bins) {
    const fullPath = join(ROOT, relativePath);
    if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
      fail(`bin target for ${name} does not exist: ${relativePath}`);
    }
  }

  return bins.length;
}

function runDeadScaffoldAudit() {
  const auditor = join(ROOT, 'scripts/audit-dead-scaffolds.mjs');
  if (!existsSync(auditor)) {
    fail('dead-scaffold auditor missing at scripts/audit-dead-scaffolds.mjs');
  }
  const result = spawnSync(process.execPath, [auditor], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    fail('dead-scaffold audit failed — see output above');
  }
}

const syntaxCount = runSyntaxChecks();
const jsonCount = validateJsonManifests();
const binCount = validatePackageEntrypoints();
runDeadScaffoldAudit();

process.stdout.write(`forge lint ok: syntax=${syntaxCount} json=${jsonCount} bins=${binCount}\n`);
