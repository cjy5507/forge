#!/usr/bin/env node
// Forge Hook: UserPromptSubmit — detects forge-related messages and injects phase context

import { readFileSync, existsSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';

const ENGLISH_TRIGGERS = [/\bforge\b/i, /\/forge\b/, /\bbuild me\b/i, /\bcreate me\b/i, /\bmake me\b/i];
const KOREAN_TRIGGERS = ['포지', '만들어줘', '만들어 줘'];

async function main() {
  const input = await readStdin();
  const message = (input?.message || input?.content || '').toLowerCase();

  const isForgeRequest =
    ENGLISH_TRIGGERS.some(re => re.test(message)) ||
    KOREAN_TRIGGERS.some(t => message.includes(t));

  if (!isForgeRequest) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const stateFile = '.forge/state.json';
  let context = '[Forge] New project request detected. Use forge:intake to begin.';

  if (existsSync(stateFile)) {
    try {
      const state = JSON.parse(readFileSync(stateFile, 'utf8'));
      const phaseSkills = ['intake', 'discovery', 'design', 'develop', 'qa', 'security', 'fix', 'deliver'];
      const currentSkill = phaseSkills[state.phase] || 'forge';
      context = `[Forge] Resuming project "${state.project}". Current phase: ${state.phase}/7 (${state.phase_name}). Use forge:${currentSkill} to continue.`;
    } catch (error) {
      handleHookError(error, 'phase-detector');
    }
  }

  console.log(JSON.stringify({
    continue: true,
    additionalContext: context
  }));
}

main();
