#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — accumulate edited files for Stop-time checks

import { runHook } from './lib/hook-runner.mjs';
import { resolveForgeBaseDir } from './lib/forge-io.mjs';
import { readForgeState, updateRuntimeState } from './lib/forge-session.mjs';
import { isProjectActive } from './lib/forge-interaction.mjs';
import { detectProjectCommands, formatCommandSpec } from './lib/forge-tooling.mjs';
import { readEnvTier } from './lib/forge-tiers.mjs';

function normalizeEditedFile(input = {}) {
  const filePath = String(input?.tool_input?.file_path || input?.file_path || '').trim();
  return filePath;
}

runHook(async (input) => {
  const envTier = readEnvTier();
  if (envTier === 'off') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const cwd = input?.cwd || '.';
  const rootCwd = resolveForgeBaseDir(cwd);
  const state = readForgeState(rootCwd);
  const filePath = normalizeEditedFile(input);

  if (!filePath || !state || !isProjectActive(state)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const detected = detectProjectCommands(rootCwd, process.env);
  updateRuntimeState(rootCwd, current => {
    const editedFiles = Array.from(new Set([...(current.tooling?.edited_files || []), filePath])).slice(-100);

    return {
      ...current,
      tooling: {
        ...(current.tooling || {}),
        package_manager: detected.packageManager,
        package_manager_source: detected.packageManagerSource,
        detected_commands: {
          lint: formatCommandSpec(detected.commands.lint),
          typecheck: formatCommandSpec(detected.commands.typecheck),
          test: formatCommandSpec(detected.commands.test),
          build: formatCommandSpec(detected.commands.build),
          format: formatCommandSpec(detected.commands.format),
        },
        edited_files: editedFiles,
        last_batch_check: current.tooling?.last_batch_check || {
          at: '',
          status: '',
          summary: '',
          commands: [],
        },
      },
    };
  });

  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}, { name: 'post-edit-accumulator' });
