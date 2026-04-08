import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { buildStopBatchCheckPlan, classifyToolFailure, detectPackageManager, detectProjectCommands, formatCommandSpec } from './lib/forge-tooling.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const TEMP_DIRS: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-tooling-'));
  TEMP_DIRS.push(cwd);
  return cwd;
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe('forge tooling helpers', () => {
  it('detects package manager from package.json', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.0.0',
      scripts: {},
    }));

    const detected = detectPackageManager(cwd);
    expect(detected.manager).toBe('pnpm');
    expect(detected.source).toBe('package.json:packageManager');
  });

  it('detects project commands with tsconfig fallback', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'eslint .',
        test: 'vitest run',
      },
    }));
    writeFileSync(join(cwd, 'tsconfig.json'), '{}\n');

    const detected = detectProjectCommands(cwd);
    expect(formatCommandSpec(detected.commands.lint)).toContain('run lint');
    expect(formatCommandSpec(detected.commands.typecheck)).toContain('tsc --noEmit');
    expect(formatCommandSpec(detected.commands.test)).toContain('run test');
  });

  it('builds a stop batch plan from edited file signals', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'eslint .',
        typecheck: 'tsc --noEmit',
        test: 'vitest run',
      },
    }));

    const plan = buildStopBatchCheckPlan({
      cwd,
      state: { phase_id: 'fix' },
      runtime: {
        tooling: {
          edited_files: ['src/app.ts', 'src/app.test.ts', 'package.json'],
        },
      },
    });

    expect(plan.checks.map(check => check.id)).toEqual(['lint', 'typecheck', 'test']);
  });

  it('classifies tool failures and suggests a retry command when possible', () => {
    const cwd = makeWorkspace();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'eslint .',
      },
    }));

    const classification = classifyToolFailure({
      tool_name: 'Bash',
      tool_input: { command: 'npm run lint' },
      error: 'Lint failed',
    }, { cwd });

    expect(classification.category).toBe('lint');
    expect(classification.suggestedCommand).toContain('run lint');
  });
});
