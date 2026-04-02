#!/usr/bin/env node
// Forge Hook: UserPromptSubmit — detects forge-related messages and injects phase context

import { readFileSync, existsSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';

const FORGE_TRIGGERS = [
  'forge', '/forge', '포지',
  '만들어줘', '만들어 줘', 'build me', 'create me', 'make me'
];

async function main() {
  const input = await readStdin();
  const message = (input?.message || input?.content || '').toLowerCase();

  const isForgeRequest = FORGE_TRIGGERS.some(t => message.includes(t));

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
      context = `[Forge] Resuming project "${state.project}". Current phase: ${state.phase}/6 (${state.phase_name}). Use forge:${currentSkill} to continue.`;
    } catch {
      // ignore parse errors
    }
  }

  console.log(JSON.stringify({
    continue: true,
    additionalContext: context
  }));
}

main();
