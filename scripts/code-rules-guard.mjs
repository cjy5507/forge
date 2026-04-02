#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — reminds to verify code-rules.md compliance

import { existsSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';

async function main() {
  await readStdin();

  const rulesFile = '.forge/code-rules.md';
  if (!existsSync(rulesFile)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  console.log(JSON.stringify({
    continue: true,
    additionalContext: '[Forge Code Rules] Code written. Verify naming, structure, patterns match .forge/code-rules.md. Inconsistent code = PR rejected.'
  }));
}

main();
