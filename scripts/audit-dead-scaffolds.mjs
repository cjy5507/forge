#!/usr/bin/env node

// Detects "declared but unconsumed" state fields: producer exists in runtime
// code but no consumer reads the field anywhere in non-test runtime code.
//
// Strategy:
//   1. Parse types/forge-state.d.ts — extract interface field names.
//   2. For each field, scan scripts/ (excluding .test.mts and this auditor).
//      - Producer: RHS of assignment: `.field =` / `['field'] =`.
//      - Consumer: any non-assignment occurrence of `.field` / `['field']` /
//        `"field"` / `'field'`.
//   3. Fields with producers but no non-test consumers are "dead scaffolds".
//   4. Known pre-existing dead scaffolds are allowlisted so this auditor is
//      a regression gate, not a retroactive failure.

import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const ROOT = dirname(SCRIPT_DIR);

// Fields intentionally left without a runtime consumer. Each entry should
// have a recorded reason and, ideally, a planned resolution.
const ALLOWLIST = new Set();

// Interfaces whose fields are agent-facing content (serialized into
// state.json for LLM agents to read), not runtime orchestration state.
// Their fields are legitimately "producer + no code consumer" because the
// consumer is an LLM, not a script.
const SKIP_INTERFACES = new Set([
  'ForgeLessonBrief',
]);

const TYPE_FILE = 'types/forge-state.d.ts';

// Directories to scan for producer/consumer usage.
const SCAN_ROOTS = ['scripts'];

// File-suffix exclusions. Tests can produce+assert without being consumers.
const TEST_SUFFIXES = ['.test.mts', '.test.ts', '.test.mjs', '.test.js'];

function isTestFile(path) {
  return TEST_SUFFIXES.some(suffix => path.endsWith(suffix));
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (entry.isFile()) files.push(full);
  }
  return files;
}

function extractInterfaceFields(tsSource) {
  const fields = new Set();
  const lines = tsSource.split(/\r?\n/);
  let depth = 0;
  let insideInterface = false;
  let currentInterface = '';
  let skipCurrent = false;

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    if (!insideInterface) {
      const match = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/);
      if (match) {
        insideInterface = true;
        currentInterface = match[1];
        skipCurrent = SKIP_INTERFACES.has(currentInterface);
        depth = 0;
        for (const ch of trimmed) {
          if (ch === '{') depth += 1;
          else if (ch === '}') depth -= 1;
        }
        if (depth === 0 && trimmed.includes('{') && trimmed.includes('}')) {
          insideInterface = false;
          currentInterface = '';
          skipCurrent = false;
        }
      }
      continue;
    }

    for (const ch of line) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }

    if (depth === 0) {
      insideInterface = false;
      currentInterface = '';
      skipCurrent = false;
      continue;
    }

    if (skipCurrent) continue;

    const fieldMatch = trimmed.match(/^(_?[A-Za-z][A-Za-z0-9_]*)\??\s*:/);
    if (fieldMatch) {
      const name = fieldMatch[1];
      if (name === 'interface' || name === 'export') continue;
      fields.add(name);
    }
  }

  return fields;
}

function classifyUsage(content, field) {
  // Escape for regex — field names are identifiers, but still guard.
  const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Producer patterns:
  //   .field = / .field +=
  //   ['field'] = / ["field"] =
  //   obj.field = ...
  const producerPatterns = [
    new RegExp(`\\.${esc}\\s*(?:\\+|-|\\*|\\/)?=[^=]`),
    new RegExp(`\\[['"\`]${esc}['"\`]\\]\\s*(?:\\+|-|\\*|\\/)?=[^=]`),
  ];

  // Consumer patterns (anything else that references the name):
  //   .field (not followed by =)
  //   ['field'] / ["field"] / \`field\`
  //   "field" / 'field' / field: in object literal destructure
  const consumerPatterns = [
    new RegExp(`\\.${esc}\\b(?!\\s*=[^=])`),
    new RegExp(`\\[['"\`]${esc}['"\`]\\]`),
    new RegExp(`['"\`]${esc}['"\`]`),
  ];

  const hasProducer = producerPatterns.some(rx => rx.test(content));
  const hasConsumer = consumerPatterns.some(rx => rx.test(content));

  return { hasProducer, hasConsumer };
}

function auditField(field, runtimeFiles, testFiles) {
  let producerRefs = [];
  let consumerRefs = [];
  let testOnlyRefs = [];

  for (const { path, content } of runtimeFiles) {
    const { hasProducer, hasConsumer } = classifyUsage(content, field);
    if (hasProducer) producerRefs.push(path);
    if (hasConsumer) consumerRefs.push(path);
  }
  for (const { path, content } of testFiles) {
    const { hasProducer, hasConsumer } = classifyUsage(content, field);
    if (hasProducer || hasConsumer) testOnlyRefs.push(path);
  }

  return { producerRefs, consumerRefs, testOnlyRefs };
}

function loadFiles(roots) {
  const runtimeFiles = [];
  const testFiles = [];
  for (const rel of roots) {
    const dir = join(ROOT, rel);
    for (const full of walk(dir)) {
      if (!/\.(mjs|mts|ts|js)$/.test(full)) continue;
      if (full === SCRIPT_PATH) continue;
      let content;
      try {
        if (!statSync(full).isFile()) continue;
        content = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const bucket = isTestFile(full) ? testFiles : runtimeFiles;
      bucket.push({ path: relative(ROOT, full), content });
    }
  }
  return { runtimeFiles, testFiles };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const jsonMode = args.has('--json');
  const verbose = args.has('--verbose');

  const typeSource = readFileSync(join(ROOT, TYPE_FILE), 'utf8');
  const fields = extractInterfaceFields(typeSource);
  if (fields.size === 0) {
    process.stderr.write(`[audit-dead-scaffolds] no interface fields found in ${TYPE_FILE}\n`);
    process.exit(2);
  }

  const { runtimeFiles, testFiles } = loadFiles(SCAN_ROOTS);

  const dead = [];
  const allowlisted = [];
  const unused = [];
  const alive = [];

  for (const field of fields) {
    const { producerRefs, consumerRefs, testOnlyRefs } = auditField(field, runtimeFiles, testFiles);
    const hasRuntimeProducer = producerRefs.length > 0;
    const hasRuntimeConsumer = consumerRefs.length > 0;

    if (!hasRuntimeProducer && !hasRuntimeConsumer && testOnlyRefs.length === 0) {
      unused.push({ field });
      continue;
    }

    if (hasRuntimeProducer && !hasRuntimeConsumer) {
      const record = { field, producers: producerRefs, testOnly: testOnlyRefs };
      if (ALLOWLIST.has(field)) allowlisted.push(record);
      else dead.push(record);
      continue;
    }

    alive.push({ field });
  }

  const summary = {
    total_fields: fields.size,
    alive: alive.length,
    unused_declarations: unused.length,
    allowlisted_dead: allowlisted.length,
    dead_scaffolds: dead.length,
  };

  if (jsonMode) {
    process.stdout.write(
      `${JSON.stringify({ summary, dead, allowlisted, unused: verbose ? unused : unused.length }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(
      `audit-dead-scaffolds: ${summary.total_fields} fields — `
        + `alive=${summary.alive}, unused=${summary.unused_declarations}, `
        + `allowlisted=${summary.allowlisted_dead}, dead=${summary.dead_scaffolds}\n`,
    );
    if (dead.length > 0) {
      process.stdout.write('\nDEAD scaffolds (producer, no runtime consumer):\n');
      for (const entry of dead) {
        process.stdout.write(`  - ${entry.field}\n`);
        for (const p of entry.producers) {
          process.stdout.write(`      producer: ${p}\n`);
        }
      }
    }
    if (verbose && allowlisted.length > 0) {
      process.stdout.write('\nAllowlisted (known dead, tracked):\n');
      for (const entry of allowlisted) {
        process.stdout.write(`  - ${entry.field}\n`);
      }
    }
  }

  if (dead.length > 0) {
    process.exit(1);
  }
}

main();
