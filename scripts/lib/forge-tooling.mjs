import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const SUPPORTED_PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const TYPED_EXTENSIONS = new Set(['.ts', '.tsx']);
const TEST_FILE_PATTERN = /(?:^|[./\\])(test|tests|spec|specs)(?:[./\\]|$)|\.(test|spec)\.[cm]?[jt]sx?$/i;
const MANIFEST_FILE_PATTERN = /(?:^|[./\\])(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig\.json)$/i;

function safeReadJson(path) {
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function normalizePackageManager(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return SUPPORTED_PACKAGE_MANAGERS.has(normalized) ? normalized : '';
}

function extractPackageManagerFromPackageJson(packageJson = null) {
  const raw = typeof packageJson?.packageManager === 'string' ? packageJson.packageManager : '';
  const [manager] = raw.split('@');
  return normalizePackageManager(manager);
}

function buildScriptCommand(manager, scriptName, extraArgs = []) {
  const normalizedManager = normalizePackageManager(manager) || 'npm';
  if (normalizedManager === 'yarn') {
    return ['run', scriptName, ...extraArgs];
  }

  const args = ['run', scriptName];
  if (extraArgs.length > 0) {
    args.push('--', ...extraArgs);
  }
  return args;
}

function createScriptCommandSpec(manager, scriptName, source) {
  return {
    available: true,
    kind: 'script',
    runner: manager,
    scriptName,
    args: buildScriptCommand(manager, scriptName),
    source,
  };
}

function createBinaryCommandSpec(runner, args, source) {
  return {
    available: true,
    kind: 'binary',
    runner,
    args: [...args],
    source,
  };
}

function createMissingCommandSpec(source = '') {
  return {
    available: false,
    kind: '',
    runner: '',
    args: [],
    source,
  };
}

function extensionOf(filePath = '') {
  const index = filePath.lastIndexOf('.');
  return index >= 0 ? filePath.slice(index).toLowerCase() : '';
}

export function detectPackageManager(cwd = '.', env = process.env) {
  const envValue = normalizePackageManager(env?.FORGE_PACKAGE_MANAGER || '');
  if (envValue) {
    return { manager: envValue, source: 'env:FORGE_PACKAGE_MANAGER' };
  }

  const packageJson = safeReadJson(join(cwd, 'package.json'));
  const packageJsonValue = extractPackageManagerFromPackageJson(packageJson);
  if (packageJsonValue) {
    return { manager: packageJsonValue, source: 'package.json:packageManager' };
  }

  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    return { manager: 'pnpm', source: 'pnpm-lock.yaml' };
  }
  if (existsSync(join(cwd, 'yarn.lock'))) {
    return { manager: 'yarn', source: 'yarn.lock' };
  }
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) {
    return { manager: 'bun', source: 'bun.lock*' };
  }
  if (existsSync(join(cwd, 'package-lock.json'))) {
    return { manager: 'npm', source: 'package-lock.json' };
  }

  return { manager: 'npm', source: 'default' };
}

export function detectProjectCommands(cwd = '.', env = process.env) {
  const packageJson = safeReadJson(join(cwd, 'package.json'));
  const scripts = packageJson?.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};
  const { manager, source: packageManagerSource } = detectPackageManager(cwd, env);
  const tsconfigExists = existsSync(join(cwd, 'tsconfig.json'));

  return {
    packageManager: manager,
    packageManagerSource,
    commands: {
      lint: typeof scripts.lint === 'string'
        ? createScriptCommandSpec(manager, 'lint', 'package.json:scripts.lint')
        : createMissingCommandSpec('missing'),
      typecheck: typeof scripts.typecheck === 'string'
        ? createScriptCommandSpec(manager, 'typecheck', 'package.json:scripts.typecheck')
        : (tsconfigExists ? createBinaryCommandSpec('npx', ['tsc', '--noEmit'], 'tsconfig.json') : createMissingCommandSpec('missing')),
      test: typeof scripts.test === 'string'
        ? createScriptCommandSpec(manager, 'test', 'package.json:scripts.test')
        : createMissingCommandSpec('missing'),
      build: typeof scripts.build === 'string'
        ? createScriptCommandSpec(manager, 'build', 'package.json:scripts.build')
        : createMissingCommandSpec('missing'),
      format: typeof scripts.format === 'string'
        ? createScriptCommandSpec(manager, 'format', 'package.json:scripts.format')
        : createMissingCommandSpec('missing'),
    },
  };
}

export function formatCommandSpec(spec = null) {
  if (!spec?.available) {
    return '';
  }

  const runner = spec.runner || '';
  const args = Array.isArray(spec.args) ? spec.args : [];
  return [runner, ...args].filter(Boolean).join(' ').trim();
}

export function runCommandSpec(spec, cwd = '.', { extraArgs = [] } = {}) {
  if (!spec?.available) {
    return {
      status: 0,
      stdout: '',
      stderr: '',
      skipped: true,
    };
  }

  const baseArgs = spec.kind === 'script'
    ? buildScriptCommand(spec.runner, spec.scriptName, extraArgs)
    : [...(spec.args || []), ...extraArgs];

  return spawnSync(spec.runner, baseArgs, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

export function classifyToolFailure(input, { cwd = '.', env = process.env } = {}) {
  const toolName = String(input?.tool_name || 'unknown');
  const command = String(input?.tool_input?.command || '');
  const errorText = String(input?.error || input?.tool_error || input?.stderr || '');
  const combined = `${toolName} ${command} ${errorText}`.toLowerCase();
  const detected = detectProjectCommands(cwd, env);
  const lintCommand = formatCommandSpec(detected.commands.lint);
  const typecheckCommand = formatCommandSpec(detected.commands.typecheck);
  const testCommand = formatCommandSpec(detected.commands.test);
  const buildCommand = formatCommandSpec(detected.commands.build);

  if (toolName === 'Bash' && /(git worktree|rebase|merge|conflict)/.test(combined)) {
    return {
      category: 'git',
      guidance: 'Git/worktree operation failed. Inspect repo state before retrying.',
      suggestedCommand: 'git status',
    };
  }

  if (/(review|request-changes|changes requested|pr review)/.test(combined)) {
    return {
      category: 'review',
      guidance: 'Review operation failed. Resolve the requested changes before retrying.',
      suggestedCommand: '',
    };
  }

  if (toolName === 'Bash' && (combined.includes(' lint') || combined.includes('eslint') || (lintCommand && combined.includes(lintCommand)))) {
    return {
      category: 'lint',
      guidance: 'Lint failed. Fix reported violations before retrying.',
      suggestedCommand: lintCommand,
    };
  }

  if (toolName === 'Bash' && (/(vitest|jest|playwright|\btest\b)/.test(combined) || (testCommand && combined.includes(testCommand)))) {
    return {
      category: 'test',
      guidance: 'Test command failed. Reproduce one failing target, capture the first real assertion or stack trace, then retry narrowly.',
      suggestedCommand: testCommand,
    };
  }

  if (toolName === 'Bash' && (/(next build|\bbuild\b|tsc|typecheck)/.test(combined) || (typecheckCommand && combined.includes(typecheckCommand)) || (buildCommand && combined.includes(buildCommand)))) {
    return {
      category: 'build',
      guidance: 'Build or typecheck failed. Fix the first compile error, then re-run the smallest proving command.',
      suggestedCommand: typecheckCommand || buildCommand,
    };
  }

  if (toolName === 'Task' || toolName === 'Agent') {
    return {
      category: 'delegation',
      guidance: 'Delegation failed. Tighten scope and acceptance criteria before retrying.',
      suggestedCommand: '',
    };
  }

  return {
    category: 'unknown',
    guidance: 'Tool execution failed. Adjust approach before repeating the same command.',
    suggestedCommand: '',
  };
}

function collectEditedFileSignals(editedFiles = []) {
  const normalized = Array.from(new Set((Array.isArray(editedFiles) ? editedFiles : []).map(file => String(file || '').trim()).filter(Boolean)));
  let hasCodeFiles = false;
  let hasTypedFiles = false;
  let hasTestFiles = false;
  let hasManifestFiles = false;

  for (const filePath of normalized) {
    const ext = extensionOf(filePath);
    if (CODE_EXTENSIONS.has(ext)) {
      hasCodeFiles = true;
    }
    if (TYPED_EXTENSIONS.has(ext)) {
      hasTypedFiles = true;
    }
    if (TEST_FILE_PATTERN.test(filePath)) {
      hasTestFiles = true;
    }
    if (MANIFEST_FILE_PATTERN.test(filePath)) {
      hasManifestFiles = true;
    }
  }

  return {
    editedFiles: normalized,
    hasCodeFiles,
    hasTypedFiles,
    hasTestFiles,
    hasManifestFiles,
  };
}

export function buildStopBatchCheckPlan({ cwd = '.', runtime = {}, state = {}, env = process.env } = {}) {
  const detected = detectProjectCommands(cwd, env);
  const signals = collectEditedFileSignals(runtime?.tooling?.edited_files || []);
  const checks = [];
  const phaseId = String(state?.phase_id || state?.phase || '').trim().toLowerCase();

  if (signals.editedFiles.length === 0) {
    return {
      packageManager: detected.packageManager,
      packageManagerSource: detected.packageManagerSource,
      editedFiles: [],
      checks: [],
    };
  }

  if (signals.hasCodeFiles && detected.commands.lint.available) {
    checks.push({
      id: 'lint',
      reason: 'edited source files',
      spec: detected.commands.lint,
    });
  }

  if ((signals.hasTypedFiles || signals.hasManifestFiles) && detected.commands.typecheck.available) {
    checks.push({
      id: 'typecheck',
      reason: signals.hasManifestFiles ? 'dependency or tsconfig changes' : 'edited TypeScript files',
      spec: detected.commands.typecheck,
    });
  }

  if ((signals.hasTestFiles || signals.hasManifestFiles || ['qa', 'verify', 'regress', 'fix'].includes(phaseId)) && detected.commands.test.available) {
    checks.push({
      id: 'test',
      reason: signals.hasTestFiles ? 'edited test files' : (signals.hasManifestFiles ? 'manifest changes' : `phase ${phaseId}`),
      spec: detected.commands.test,
    });
  }

  return {
    packageManager: detected.packageManager,
    packageManagerSource: detected.packageManagerSource,
    editedFiles: signals.editedFiles,
    checks,
  };
}

export function runStopBatchChecks(plan, { cwd = '.' } = {}) {
  const results = [];

  for (const check of plan.checks || []) {
    const result = runCommandSpec(check.spec, cwd);
    results.push({
      id: check.id,
      reason: check.reason,
      command: formatCommandSpec(check.spec),
      ok: result.status === 0,
      status: result.status ?? 1,
      output: String(result.stdout || result.stderr || '').trim(),
    });

    if (result.status !== 0) {
      break;
    }
  }

  return results;
}

export function summarizeStopBatchResults(results = []) {
  if (!Array.isArray(results) || results.length === 0) {
    return 'No batch checks were run.';
  }

  const failed = results.find(result => !result.ok);
  if (failed) {
    return `${failed.id} failed via "${failed.command}".`;
  }

  return `Passed: ${results.map(result => result.id).join(', ')}.`;
}
