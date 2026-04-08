#!/usr/bin/env node

import { readVerificationArtifact } from './lib/forge-verification.mjs';

const options = {
  json: process.argv.includes('--json'),
};

const verification = readVerificationArtifact(process.cwd()) || {
  updated_at: '',
  edited_files: [],
  selected_checks: [],
  status: '',
  summary: '',
};

if (options.json) {
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
} else {
  const lines = [
    `Verification status: ${verification.status || '(none)'}`,
    `Updated: ${verification.updated_at || '(none)'}`,
    `Edited files: ${Array.isArray(verification.edited_files) ? verification.edited_files.length : 0}`,
    `Checks: ${Array.isArray(verification.selected_checks) ? verification.selected_checks.length : 0}`,
  ];

  if (verification.summary) {
    lines.push(`Summary: ${verification.summary}`);
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}
