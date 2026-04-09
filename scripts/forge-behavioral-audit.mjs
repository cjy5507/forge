#!/usr/bin/env node

import { join } from 'path';
import { writeFileSync } from 'fs';
import { withJsonReadCache, ensureForgeProjectLayout } from './lib/forge-io.mjs';
import { buildBehavioralAuditReport, renderBehavioralAuditReport } from './lib/forge-behavioral-audit.mjs';
import { readForgeState, readRuntimeState } from './lib/forge-session.mjs';

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    write: argv.includes('--write'),
    help: argv.includes('--help'),
  };
}

function printUsage() {
  console.log(`Forge behavioral audit helper

Usage:
  node scripts/forge-behavioral-audit.mjs
  node scripts/forge-behavioral-audit.mjs --json
  node scripts/forge-behavioral-audit.mjs --write
`);
}

function buildPayload(cwd = '.') {
  const state = readForgeState(cwd);
  const runtime = readRuntimeState(cwd, { state });
  const locale = runtime?.preferred_locale || runtime?.detected_locale || 'en';
  const report = buildBehavioralAuditReport({ state, runtime });
  const markdown = renderBehavioralAuditReport(report, locale);

  return {
    locale,
    report,
    markdown,
  };
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printUsage();
  process.exit(0);
}

withJsonReadCache(() => {
  const payload = buildPayload(process.cwd());

  if (options.write) {
    const forgeDir = ensureForgeProjectLayout(process.cwd());
    const target = join(forgeDir, 'evidence', 'behavioral-audit.md');
    writeFileSync(target, payload.markdown);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload.report, null, 2)}\n`);
  } else {
    process.stdout.write(payload.markdown);
  }
});
