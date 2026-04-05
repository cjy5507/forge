import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-hooks-'));
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

function writeState(cwd, overrides = {}) {
  const state = {
    version: '0.1.0',
    project: 'test-project',
    phase: 3,
    phase_id: 'develop',
    phase_index: 3,
    phase_name: 'develop',
    status: 'active',
    created_at: '',
    updated_at: '',
    client_name: '',
    agents_active: [],
    spec_approved: true,
    design_approved: true,
    tasks: [],
    holes: [],
    pr_queue: [],
    version_tag: 'v1',
    rollback_tags: [],
    ...overrides,
  };

  writeFileSync(join(cwd, '.forge', 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
}

function runHook(scriptName, cwd, payload = {}, options = {}) {
  const scriptPath = join(FORGE_ROOT, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    input: JSON.stringify({ cwd, ...payload }),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout || '{}');
}

/**
 * Like runHook but does not assert on stderr and returns raw result
 * for scripts that produce multiple JSON lines or write to stderr.
 */
function runHookRaw(scriptName, cwd, payload = {}, options = {}) {
  const scriptPath = join(FORGE_ROOT, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    input: JSON.stringify({ cwd, ...payload }),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runHookRawInput(scriptName, cwd, input, options = {}) {
  const scriptPath = join(FORGE_ROOT, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function parseJsonLines(stdout) {
  return String(stdout)
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

describe('forge harness hooks', () => {
  it('keeps published plugin versions aligned with package.json', () => {
    const pkg = JSON.parse(
      readFileSync(join(FORGE_ROOT, 'package.json'), 'utf8'),
    );
    const claudeManifest = JSON.parse(
      readFileSync(join(FORGE_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    const claudeMarketplace = JSON.parse(
      readFileSync(join(FORGE_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'),
    );
    const codexManifest = JSON.parse(
      readFileSync(join(FORGE_ROOT, '.codex-plugin', 'plugin.json'), 'utf8'),
    );

    expect(claudeManifest.version).toBe(pkg.version);
    expect(codexManifest.version).toBe(pkg.version);
    expect(claudeMarketplace.metadata.version).toBe(pkg.version);
    expect(claudeMarketplace.plugins[0].version).toBe(pkg.version);
  });

  it('publishes a richer codex plugin manifest', () => {
    const manifest = JSON.parse(
      readFileSync(join(FORGE_ROOT, '.codex-plugin', 'plugin.json'), 'utf8'),
    );

    expect(manifest.skills).toBe('./skills/');
    expect(manifest.hooks).toBe('./hooks/hooks.json');
    expect(manifest.mcpServers).toBe('./.mcp.json');
    expect(manifest.interface.displayName).toBe('Forge');
    expect(manifest.interface.defaultPrompt).toHaveLength(3);
    expect(manifest.interface.composerIcon).toBe('./assets/forge-icon.svg');
    expect(manifest.interface.logo).toBe('./assets/forge-logo.svg');
    expect(manifest.interface.screenshots).toEqual([
      './assets/screenshot-overview.png',
      './assets/screenshot-console.png',
    ]);
    expect(manifest.interface.privacyPolicyURL).toBe(
      'https://github.com/cjy5507/forge/blob/main/PRIVACY.md',
    );
    expect(manifest.interface.termsOfServiceURL).toBe(
      'https://github.com/cjy5507/forge/blob/main/TERMS.md',
    );
  });

  it('keeps Claude marketplace metadata aligned with the Codex manifest', () => {
    const claudeManifest = JSON.parse(
      readFileSync(join(FORGE_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    const claudeMarketplace = JSON.parse(
      readFileSync(join(FORGE_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'),
    );
    const codexManifest = JSON.parse(
      readFileSync(join(FORGE_ROOT, '.codex-plugin', 'plugin.json'), 'utf8'),
    );

    expect(codexManifest.repository).toBe(claudeManifest.repository);
    expect(codexManifest.homepage).toBe(claudeManifest.homepage);
    expect(codexManifest.interface.websiteURL).toBe(claudeMarketplace.plugins[0].homepage);
    expect(codexManifest.name).toBe(claudeMarketplace.plugins[0].name);
  });

  it('publishes shared MCP wiring without repo-specific install assumptions', () => {
    const mcp = JSON.parse(
      readFileSync(join(FORGE_ROOT, '.mcp.json'), 'utf8'),
    );

    expect(mcp.mcpServers.context7.url).toBe('https://mcp.context7.com/mcp');
  });

  it('keeps plugin files free of repo-specific hardcoded paths', () => {
    const files = [
      join(FORGE_ROOT, 'README.md'),
      join(FORGE_ROOT, '.claude-plugin', 'plugin.json'),
      join(FORGE_ROOT, '.codex-plugin', 'plugin.json'),
      join(FORGE_ROOT, '.mcp.json'),
      join(FORGE_ROOT, 'PUBLISHING.md'),
      join(FORGE_ROOT, 'RELEASE_CHECKLIST.md'),
      join(FORGE_ROOT, 'README.md'),
    ];

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('/Users/joejaeyoung')).toBe(false);
      expect(text.includes('gosusignal-local')).toBe(false);
      expect(text.includes('.agents/plugins/marketplace.json')).toBe(false);
      expect(text.match(/\b(?:node|npm test --)\s+forge\/scripts\//)).toBeNull();
    }
  });

  it('uses plugin-root hook commands that Claude can resolve at runtime', () => {
    const hooksConfig = JSON.parse(
      readFileSync(join(FORGE_ROOT, 'hooks', 'hooks.json'), 'utf8'),
    );
    const commands = Object.values(hooksConfig.hooks)
      .flat()
      .flatMap((entry) => entry.hooks.map((hook) => hook.command));

    for (const command of commands) {
      expect(command).toContain('${CLAUDE_PLUGIN_ROOT}');
      expect(command).toMatch(/^node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/.+\.mjs"$/);
    }
  });

  it('ships marketplace assets referenced by the manifest', () => {
    const files = [
      join(FORGE_ROOT, 'assets', 'forge-icon.svg'),
      join(FORGE_ROOT, 'assets', 'forge-logo.svg'),
      join(FORGE_ROOT, 'assets', 'screenshot-overview.png'),
      join(FORGE_ROOT, 'assets', 'screenshot-console.png'),
    ];

    for (const file of files) {
      const content = readFileSync(file);
      expect(content.byteLength).toBeGreaterThan(0);
    }
  });

  it('returns SessionStart hookSpecificOutput and normalizes state', () => {
    const cwd = makeWorkspace();
    writeState(cwd, { phase: 4.5, phase_id: 'security', phase_name: 'security' });

    const output = runHook('state-restore.mjs', cwd);
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput.additionalContext).toContain('[Forge]');
    expect(output.hookSpecificOutput.additionalContext).toContain('security');

    const normalized = JSON.parse(readFileSync(join(cwd, '.forge', 'state.json'), 'utf8'));
    expect(normalized.phase_id).toBe('security');
    expect(normalized.phase_index).toBe(5);
  });

  it('includes company-mode gate and blocker hints on SessionStart when runtime has them', () => {
    const cwd = makeWorkspace();
    writeState(cwd, { phase: 'delivery', phase_id: 'delivery', phase_name: 'delivery' });
    writeRuntimeState(cwd, {
      company_mode: 'autonomous_company',
      active_gate: 'qa',
      delivery_readiness: 'blocked',
      customer_blockers: [{ summary: 'Confirm pricing policy' }],
      internal_blockers: [{ summary: 'Regression remains' }, { summary: 'Visual mismatch' }],
    });

    const output = runHook('state-restore.mjs', cwd);
    expect(output.hookSpecificOutput.additionalContext).toContain('auto');
    expect(output.hookSpecificOutput.additionalContext).toContain('gate:customer_review');
    expect(output.hookSpecificOutput.additionalContext).toContain('c1');
    expect(output.hookSpecificOutput.additionalContext).toContain('i2');

    const runtime = JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.last_compact_context).toContain('gate:customer_review');
  });

  it('denies high-risk writes when harness prerequisites are missing in full tier', () => {
    const cwd = makeWorkspace();
    writeState(cwd, { spec_approved: false, design_approved: false });

    const output = runHook('write-gate.mjs', cwd, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'package.json',
        content: '{"dependencies":{"new-lib":"1.0.0"}}',
      },
    }, {
      env: { FORGE_TIER: 'full' },
    });

    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    // Phase gate fires first (tier-independent) when artifacts are missing
    expect(output.hookSpecificOutput.permissionDecisionReason).toMatch(/phase gate|Missing/);
  });

  it('phase gate denies even at light tier when artifacts are missing', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const output = runHook('write-gate.mjs', cwd, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/utils/formatDate.ts',
        content: 'export function formatDate() {}',
      },
    }, {
      env: { FORGE_TIER: 'light' },
    });

    // Phase gate is tier-independent — denies at light when artifacts missing
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toMatch(/phase gate/);
  });

  it('skips spec and design approvals in repair mode', () => {
    const cwd = makeWorkspace();
    writeState(cwd, {
      mode: 'repair',
      phase: 'fix',
      phase_id: 'fix',
      phase_name: 'fix',
      phase_index: 3,
      spec_approved: false,
      design_approved: false,
    });
    mkdirSync(join(cwd, '.forge', 'contracts'), { recursive: true });
    mkdirSync(join(cwd, '.forge', 'evidence', 'rca'), { recursive: true });
    writeFileSync(join(cwd, '.forge', 'contracts', 'api.ts'), 'export interface API {}');
    writeFileSync(join(cwd, '.forge', 'code-rules.md'), '# rules\n');

    const output = runHook('write-gate.mjs', cwd, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'package.json',
        content: '{"dependencies":{"new-lib":"1.0.0"}}',
      },
    }, {
      env: { FORGE_TIER: 'full' },
    });

    expect(output.hookSpecificOutput.permissionDecision).not.toBe('deny');
    expect(output.hookSpecificOutput.additionalContext).toContain('[Forge] full');
  });

  it('tracks subagent lifecycle in runtime state', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const startOutput = runHook('subagent-start.mjs', cwd, {
      agent_id: 'agent-1',
      agent_type: 'Explore',
    });
    expect(startOutput.hookSpecificOutput.hookEventName).toBe('SubagentStart');

    runHook('subagent-stop.mjs', cwd, {
      agent_id: 'agent-1',
      agent_type: 'Explore',
      last_assistant_message: 'done',
    });

    const runtime = JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.active_agents['agent-1']).toBeUndefined();
    expect(runtime.recent_agents[0].kind).toBe('subagent-stop');
    expect(runtime.stats.agent_calls).toBe(1);
  });

  it('blocks premature stop while work is still active', () => {
    const cwd = makeWorkspace();
    writeState(cwd, { tasks: ['T-1'] });

    const output = runHook('stop-guard.mjs', cwd, {
      last_assistant_message: 'Implemented the change and moving on.',
      stop_hook_active: false,
    }, {
      env: { FORGE_TIER: 'full' },
    });

    expect(output.decision).toBe('block');
    expect(output.reason).toContain('still in progress');
  });

  it('injects recovery guidance on tool failure', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const output = runHook('tool-failure.mjs', cwd, {
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      error: 'Command failed',
    });

    expect(output.hookSpecificOutput.hookEventName).toBe('PostToolUseFailure');
    expect(output.hookSpecificOutput.additionalContext).toContain('Test command failed');

    const runtime = JSON.parse(readFileSync(join(cwd, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.stats.failure_count).toBe(1);
    expect(runtime.stats.test_failures).toBe(1);
  });

  it('keeps company gate, staffing, and session ownership coherent across a synthetic delivery flow', () => {
    const cwd = makeWorkspace();

    writeState(cwd, {
      phase: 'discovery',
      phase_id: 'discovery',
      phase_name: 'discovery',
      spec_approved: false,
      design_approved: false,
      status: 'active',
    });

    runHook('state-restore.mjs', cwd);
    let runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('spec_readiness');
    expect(runtime.next_session_owner).toBe('pm');

    writeState(cwd, {
      phase: 'design',
      phase_id: 'design',
      phase_name: 'design',
      spec_approved: true,
      design_approved: false,
      status: 'active',
    });

    let output = runHook('phase-detector.mjs', cwd, { message: 'forge status' });
    runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('design_readiness');
    expect(runtime.next_session_owner).toBe('cto');
    expect(output.hookSpecificOutput.additionalContext).toContain('gate:design_readiness');

    writeState(cwd, {
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });

    output = runHook('phase-detector.mjs', cwd, { message: 'forge status' });
    runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('implementation_readiness');
    expect(runtime.next_session_owner).toBe('lead-dev');
    expect(output.hookSpecificOutput.additionalContext).toContain('gate:implementation_readiness');

    writeState(cwd, {
      phase: 'qa',
      phase_id: 'qa',
      phase_name: 'qa',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });

    output = runHook('phase-detector.mjs', cwd, { message: 'forge status' });
    runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('qa');
    expect(runtime.next_session_owner).toBe('qa');
    expect(runtime.current_session_goal).toContain('QA blockers');
    expect(output.hookSpecificOutput.additionalContext).toContain('gate:qa');

    writeState(cwd, {
      phase: 'security',
      phase_id: 'security',
      phase_name: 'security',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });

    output = runHook('phase-detector.mjs', cwd, { message: 'forge status' });
    runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('security');
    expect(runtime.next_session_owner).toBe('security-reviewer');
    expect(runtime.current_session_goal).toContain('security blockers');
    expect(output.hookSpecificOutput.additionalContext).toContain('gate:security');

    writeState(cwd, {
      phase: 'fix',
      phase_id: 'fix',
      phase_name: 'fix',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });

    output = runHook('phase-detector.mjs', cwd, { message: 'forge status' });
    runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('implementation_readiness');
    expect(runtime.next_session_owner).toBe('lead-dev');
    expect(output.hookSpecificOutput.additionalContext).toContain('gate:implementation_readiness');

    writeState(cwd, {
      phase: 'delivery',
      phase_id: 'delivery',
      phase_name: 'delivery',
      spec_approved: true,
      design_approved: true,
      status: 'active',
    });
    writeRuntimeState(cwd, {
      company_mode: 'autonomous_company',
      customer_blockers: [{ summary: 'Approve final pricing copy' }],
      internal_blockers: [],
    });

    output = runHook('state-restore.mjs', cwd);
    runtime = readRuntimeState(cwd);
    expect(runtime.active_gate).toBe('customer_review');
    expect(runtime.next_session_owner).toBe('pm');
    expect(output.hookSpecificOutput.additionalContext).toContain('gate:customer_review');
    expect(output.hookSpecificOutput.additionalContext).toContain('c1');
  });
});

// ============================================================
// UNIT TESTS: forge-state.mjs functions
// ============================================================

import {
  PHASE_SEQUENCE,
  REPAIR_PHASE_SEQUENCE,
  EXPRESS_PHASE_GATES,
  BUILD_PHASE_GATES,
  REPAIR_PHASE_GATES,
  TIER_SEQUENCE,
  normalizePhaseId,
  normalizeTier,
  tierAtLeast,
  resolvePhase,
  checkPhaseGate,
  checkRepairGate,
  getPhaseGates,
  detectTaskType,
  classifyTierFromMessage,
  inferTierFromState,
  recommendedAgentsFor,
  compactForgeContext,
  summarizePendingWork,
  summarizeLaneCounts,
  selectNextLane,
  summarizeLaneBriefs,
  messageLooksInteractive,
  normalizeStateShape,
  isProjectActive,
  detectWriteRisk,
  readForgeState,
  writeForgeState,
  readRuntimeState,
  writeRuntimeState,
  updateRuntimeState,
  readActiveTier,
  updateAdaptiveTier,
  appendRecent,
} from './lib/forge-state.mjs';

describe('normalizePhaseId', () => {
  it('returns string phases as-is', () => {
    for (const phase of PHASE_SEQUENCE) {
      expect(normalizePhaseId(phase)).toBe(phase);
    }
  });

  it('converts legacy numeric phases', () => {
    expect(normalizePhaseId(0)).toBe('intake');
    expect(normalizePhaseId(1)).toBe('discovery');
    expect(normalizePhaseId(2)).toBe('design');
    expect(normalizePhaseId(3)).toBe('develop');
    expect(normalizePhaseId(4)).toBe('qa');
    expect(normalizePhaseId(4.5)).toBe('security');
    expect(normalizePhaseId(5)).toBe('fix');
    expect(normalizePhaseId(6)).toBe('delivery');
    expect(normalizePhaseId(7)).toBe('complete');
  });

  it('handles numeric strings', () => {
    expect(normalizePhaseId('0')).toBe('intake');
    expect(normalizePhaseId('4.5')).toBe('security');
    expect(normalizePhaseId('7')).toBe('complete');
  });

  it('defaults to intake for invalid input', () => {
    expect(normalizePhaseId(null)).toBe('intake');
    expect(normalizePhaseId(undefined)).toBe('intake');
    expect(normalizePhaseId('')).toBe('intake');
    expect(normalizePhaseId('invalid')).toBe('intake');
    expect(normalizePhaseId(99)).toBe('intake');
    expect(normalizePhaseId(-1)).toBe('intake');
  });
});

describe('normalizeTier', () => {
  it('returns valid tiers', () => {
    for (const tier of TIER_SEQUENCE) {
      expect(normalizeTier(tier)).toBe(tier);
    }
  });

  it('handles case insensitivity', () => {
    expect(normalizeTier('FULL')).toBe('full');
    expect(normalizeTier('Light')).toBe('light');
    expect(normalizeTier(' medium ')).toBe('medium');
  });

  it('defaults to light for invalid input', () => {
    expect(normalizeTier(null)).toBe('light');
    expect(normalizeTier(undefined)).toBe('light');
    expect(normalizeTier('')).toBe('light');
    expect(normalizeTier('invalid')).toBe('light');
    expect(normalizeTier(42)).toBe('light');
  });
});

describe('resolvePhase', () => {
  it('prefers phase_id over legacy phase fields', () => {
    const phase = resolvePhase({ phase_id: 'complete', phase: 0, phase_name: 'delivery' });
    expect(phase.id).toBe('complete');
    expect(phase.index).toBe(PHASE_SEQUENCE.indexOf('complete'));
  });
});

describe('tierAtLeast', () => {
  it('compares tiers correctly', () => {
    expect(tierAtLeast('full', 'light')).toBe(true);
    expect(tierAtLeast('full', 'medium')).toBe(true);
    expect(tierAtLeast('full', 'full')).toBe(true);
    expect(tierAtLeast('light', 'full')).toBe(false);
    expect(tierAtLeast('off', 'light')).toBe(false);
    expect(tierAtLeast('medium', 'medium')).toBe(true);
  });
});

describe('detectTaskType', () => {
  it('detects bugfix tasks', () => {
    expect(detectTaskType('fix this bug')).toBe('bugfix');
    expect(detectTaskType('이거 버그야')).toBe('bugfix');
    expect(detectTaskType('고쳐줘')).toBe('bugfix');
    expect(detectTaskType('troubleshoot the issue')).toBe('bugfix');
    expect(detectTaskType('why is this broken')).toBe('bugfix');
    expect(detectTaskType('diagnose the error')).toBe('bugfix');
  });

  it('does NOT false-positive on word boundaries', () => {
    // After fix: 'fix' should not match 'prefix' or 'suffix'
    expect(detectTaskType('the prefix is wrong')).not.toBe('bugfix');
    expect(detectTaskType('add a suffix handler')).not.toBe('bugfix');
  });

  it('detects refactor tasks', () => {
    expect(detectTaskType('refactor the module')).toBe('refactor');
    expect(detectTaskType('리팩토링해줘')).toBe('refactor');
    expect(detectTaskType('cleanup the code')).toBe('refactor');
    expect(detectTaskType('simplify this function')).toBe('refactor');
    expect(detectTaskType('rename the variable')).toBe('refactor');
  });

  it('detects review tasks', () => {
    expect(detectTaskType('review this code')).toBe('review');
    expect(detectTaskType('코드리뷰해줘')).toBe('review');
    expect(detectTaskType('PR review')).toBe('review');
  });

  it('detects question tasks', () => {
    expect(detectTaskType('what does this do')).toBe('question');
    expect(detectTaskType('explain this function')).toBe('question');
    expect(detectTaskType('질문이 있어')).toBe('question');
    expect(detectTaskType('설명해줘')).toBe('question');
    expect(detectTaskType('어떻게 작동해?')).toBe('question');
  });

  it('detects Korean question words', () => {
    // After fix: 뭐야 and 왜 should be detected
    expect(detectTaskType('이거 뭐야?')).toBe('question');
    expect(detectTaskType('왜 안 돼?')).toBe('question');
  });

  it('detects feature tasks', () => {
    expect(detectTaskType('add a login page')).toBe('feature');
    expect(detectTaskType('build a dashboard')).toBe('feature');
    expect(detectTaskType('create a new component')).toBe('feature');
    expect(detectTaskType('기능 추가해줘')).toBe('feature');
    expect(detectTaskType('구현해줘')).toBe('feature');
  });

  it('detects pipeline tasks', () => {
    expect(detectTaskType('run all phases')).toBe('pipeline');
    expect(detectTaskType('full pipeline')).toBe('pipeline');
    expect(detectTaskType('하네스 만들어줘')).toBe('pipeline');
    expect(detectTaskType('전체 워크플로우')).toBe('pipeline');
  });

  it('returns general for empty or unclassifiable input', () => {
    expect(detectTaskType('')).toBe('general');
    expect(detectTaskType('hello')).toBe('general');
    expect(detectTaskType(null)).toBe('general');
    expect(detectTaskType(undefined)).toBe('general');
  });
});

describe('classifyTierFromMessage', () => {
  it('returns full for forge:ignite and harness triggers', () => {
    expect(classifyTierFromMessage('forge:ignite')).toBe('full');
    expect(classifyTierFromMessage('set up forge')).toBe('full');
    expect(classifyTierFromMessage('build a harness')).toBe('full');
    expect(classifyTierFromMessage('하네스 만들어줘')).toBe('full');
    expect(classifyTierFromMessage('전체 파이프라인')).toBe('full');
  });

  it('returns light for questions and bugfixes', () => {
    expect(classifyTierFromMessage('why is this broken')).toBe('light');
    expect(classifyTierFromMessage('what does this do')).toBe('light');
  });

  it('returns medium for features and refactors', () => {
    expect(classifyTierFromMessage('add a new feature')).toBe('medium');
    expect(classifyTierFromMessage('refactor this module')).toBe('medium');
  });

  it('returns full for pipeline tasks', () => {
    expect(classifyTierFromMessage('run all phases')).toBe('full');
  });

  it('returns light for review tasks', () => {
    expect(classifyTierFromMessage('review this code')).toBe('light');
  });
});

describe('inferTierFromState', () => {
  it('returns light for null state', () => {
    expect(inferTierFromState(null)).toBe('light');
  });

  it('returns light for empty object (after fix)', () => {
    expect(inferTierFromState({})).toBe('light');
  });

  it('returns full for intake/discovery/design/delivery phases', () => {
    expect(inferTierFromState({ phase_id: 'intake' })).toBe('full');
    expect(inferTierFromState({ phase_id: 'discovery' })).toBe('full');
    expect(inferTierFromState({ phase_id: 'design' })).toBe('full');
    expect(inferTierFromState({ phase_id: 'delivery' })).toBe('full');
  });

  it('scales develop tier by task/PR count', () => {
    expect(inferTierFromState({ phase_id: 'develop', tasks: [1,2,3], pr_queue: [] })).toBe('medium');
    expect(inferTierFromState({ phase_id: 'develop', tasks: [1,2,3,4,5,6], pr_queue: [] })).toBe('full');
    expect(inferTierFromState({ phase_id: 'develop', tasks: [], pr_queue: [1,2,3,4] })).toBe('full');
  });

  it('scales fix tier by hole count', () => {
    expect(inferTierFromState({ phase_id: 'fix', holes: [1] })).toBe('light');
    expect(inferTierFromState({ phase_id: 'fix', holes: [1,2,3] })).toBe('medium');
  });

  it('respects explicit tier in state', () => {
    expect(inferTierFromState({ tier: 'medium' })).toBe('medium');
  });
});

describe('recommendedAgentsFor', () => {
  it('returns empty array for off tier', () => {
    expect(recommendedAgentsFor({ tier: 'off' })).toEqual([]);
  });

  it('returns developer for light/general', () => {
    expect(recommendedAgentsFor({ tier: 'light', taskType: 'general' })).toEqual(['developer']);
  });

  it('returns troubleshooter for light/bugfix', () => {
    const agents = recommendedAgentsFor({ tier: 'light', taskType: 'bugfix' });
    expect(agents).toContain('troubleshooter');
    expect(agents).toContain('developer');
  });

  it('returns full team for full/develop', () => {
    const agents = recommendedAgentsFor({ tier: 'full', taskType: 'general', phaseId: 'develop' });
    expect(agents.length).toBeGreaterThanOrEqual(5);
    expect(agents).toContain('ceo');
    expect(agents).toContain('developer');
  });

  it('returns design team for full/design phase', () => {
    const agents = recommendedAgentsFor({ tier: 'full', phaseId: 'design' });
    expect(agents).toContain('cto');
    expect(agents).toContain('designer');
    expect(agents).toContain('researcher');
    expect(agents).toContain('analyst');
  });

  it('returns analyst for full/isolate and full/reproduce phases', () => {
    const isolateAgents = recommendedAgentsFor({ tier: 'full', phaseId: 'isolate' });
    expect(isolateAgents).toContain('analyst');
    expect(isolateAgents).toContain('troubleshooter');

    const reproduceAgents = recommendedAgentsFor({ tier: 'full', phaseId: 'reproduce' });
    expect(reproduceAgents).toContain('analyst');
    expect(reproduceAgents).toContain('troubleshooter');
  });

  it('classifies analyst as layer2_subagent with codebase-memory-mcp tool', () => {
    const agents = recommendedAgentsFor({ tier: 'full', phaseId: 'design' });
    expect(agents.layer2_subagent).toContain('analyst');
    expect(agents.tools).toContain('codebase-memory-mcp');
  });

  it('returns discovery team for full/discovery phase', () => {
    const agents = recommendedAgentsFor({ tier: 'full', phaseId: 'discovery' });
    expect(agents).toEqual(['ceo', 'pm', 'researcher']);
  });

  it('prefers customer-facing staffing when customer blockers exist in autonomous company mode', () => {
    const agents = recommendedAgentsFor({
      tier: 'full',
      phaseId: 'develop',
      runtime: {
        company_mode: 'autonomous_company',
        customer_blockers: [{ summary: 'Clarify pricing policy' }],
      },
    });

    expect(agents[0]).toBe('ceo');
    expect(agents).toContain('pm');
  });

  it('prefers gate owners for internal design and security staffing', () => {
    const designAgents = recommendedAgentsFor({
      tier: 'full',
      phaseId: 'design',
      runtime: {
        company_mode: 'autonomous_company',
        active_gate: 'design_readiness',
      },
    });
    expect(designAgents.slice(0, 2)).toEqual(['cto', 'designer']);

    const securityAgents = recommendedAgentsFor({
      tier: 'full',
      phaseId: 'delivery',
      runtime: {
        company_mode: 'autonomous_company',
        active_gate: 'security',
      },
    });
    expect(securityAgents[0]).toBe('security-reviewer');
    expect(securityAgents).toContain('developer');
  });

  it('prefers PM and Lead when session ownership is explicit', () => {
    const pmAgents = recommendedAgentsFor({
      tier: 'full',
      phaseId: 'discovery',
      runtime: {
        company_mode: 'autonomous_company',
        current_session_goal: 'Clarify V1 scope before internal design',
        next_session_owner: 'pm',
      },
    });
    expect(pmAgents[0]).toBe('pm');

    const leadAgents = recommendedAgentsFor({
      tier: 'full',
      phaseId: 'develop',
      runtime: {
        company_mode: 'autonomous_company',
        current_session_goal: 'Split implementation into reviewable lanes',
        next_session_owner: 'lead-dev',
      },
    });
    expect(leadAgents[0]).toBe('lead-dev');
  });
});

describe('normalizeStateShape', () => {
  it('preserves phase as string (after fix)', () => {
    const state = normalizeStateShape({ phase: 'develop' });
    // After fix: phase should remain a string, not be converted to index
    expect(state.phase_id).toBe('develop');
    expect(typeof state.phase).toBe('string');
  });

  it('handles complete phase correctly (no corruption)', () => {
    const state = normalizeStateShape({ phase: 'complete' });
    expect(state.phase_id).toBe('complete');
    // Write then read should NOT corrupt
    // The phase field should be 'complete', not 8
  });

  it('handles security phase correctly', () => {
    const state = normalizeStateShape({ phase: 'security' });
    expect(state.phase_id).toBe('security');
  });

  it('initializes missing arrays', () => {
    const state = normalizeStateShape({});
    expect(Array.isArray(state.agents_active)).toBe(true);
    expect(Array.isArray(state.tasks)).toBe(true);
    expect(Array.isArray(state.holes)).toBe(true);
    expect(Array.isArray(state.pr_queue)).toBe(true);
  });

  it('defaults mode to build', () => {
    expect(normalizeStateShape({}).mode).toBe('build');
  });

  it('preserves existing mode', () => {
    expect(normalizeStateShape({ mode: 'repair' }).mode).toBe('repair');
    expect(normalizeStateShape({ mode: 'express' }).mode).toBe('express');
  });
});

describe('compactForgeContext', () => {
  it('shows correct max phase count', () => {
    const context = compactForgeContext({ phase: 'complete' });
    const expectedMax = PHASE_SEQUENCE.length - 1;
    expect(context).toContain(`/${expectedMax}`);
    // Verify the phase index/total pattern matches the expected max
    expect(context).toMatch(new RegExp(`\\d+/${expectedMax}\\b`));
  });

  it('includes lane summary and resume hint when lanes exist', () => {
    const context = compactForgeContext(
      { phase: 'develop', spec_approved: true, design_approved: true },
      {
        active_tier: 'medium',
        recommended_agents: ['developer'],
        lanes: {
          api: { id: 'api', status: 'ready' },
          ui: { id: 'ui', status: 'blocked' },
        },
      },
    );

    expect(context).toContain('2l');
    expect(context).toContain('1b');
    expect(context).toContain('↺api');
  });

  it('includes autonomous company gate and blocker summaries when present', () => {
    const context = compactForgeContext(
      { phase: 'delivery', spec_approved: true, design_approved: true },
      {
        active_tier: 'full',
        company_mode: 'autonomous_company',
        active_gate: 'delivery_readiness',
        delivery_readiness: 'blocked',
        customer_blockers: [{ summary: 'Choose billing policy' }],
        internal_blockers: [{ summary: 'QA blocker' }, { summary: 'Security blocker' }],
      },
    );

    expect(context).toContain('auto');
    expect(context).toContain('gate:delivery_readiness');
    expect(context).toContain('c1');
    expect(context).toContain('i2');
  });

  it('includes session goal and next owner summaries when present', () => {
    const context = compactForgeContext(
      { phase: 'develop', spec_approved: true, design_approved: true },
      {
        active_tier: 'full',
        company_mode: 'autonomous_company',
        current_session_goal: 'Close auth review and prep merge',
        next_session_owner: 'lead-dev',
      },
    );

    expect(context).toContain('goal');
    expect(context).toContain('next:lead-dev');
  });

  it('derives session goal and next owner from gate/blockers when missing', () => {
    const cwd = makeWorkspace();
    writeState(cwd, { phase: 'design', phase_id: 'design', phase_name: 'design' });
    writeRuntimeState(cwd, {
      company_mode: 'autonomous_company',
      active_gate: 'design_readiness',
      customer_blockers: [],
      internal_blockers: [{ summary: 'Architecture tradeoff unresolved' }],
    });

    const runtime = readRuntimeState(cwd);
    expect(runtime.current_session_goal).toContain('design');
    expect(runtime.next_session_owner).toBe('cto');
  });
});

describe('lane runtime helpers', () => {
  it('summarizeLaneCounts counts normalized statuses', () => {
    const counts = summarizeLaneCounts({
      lanes: {
        api: { id: 'api', status: 'ready' },
        ui: { id: 'ui', status: 'blocked' },
        review: { id: 'review', status: 'in_review' },
      },
    });

    expect(counts.total).toBe(3);
    expect(counts.ready).toBe(1);
    expect(counts.blocked).toBe(1);
    expect(counts.in_review).toBe(1);
  });

  it('selectNextLane prefers explicit lane and then priority order', () => {
    expect(selectNextLane({ next_lane: 'ui', lanes: { ui: { id: 'ui', status: 'blocked' } } })).toBe('ui');
    expect(selectNextLane({ lanes: { api: { id: 'api', status: 'ready' }, worker: { id: 'worker', status: 'in_progress' } } })).toBe('worker');
  });

  it('summarizeLaneBriefs produces compact lane labels', () => {
    const briefs = summarizeLaneBriefs({ lanes: { api: { id: 'api', status: 'ready' }, doneLane: { id: 'doneLane', status: 'done' } } });
    expect(briefs).toEqual(['api:ready']);
  });

  it('summarizePendingWork can include lane counts', () => {
    const pending = summarizePendingWork({ phase: 'develop', tasks: [] }, { lanes: { api: { id: 'api', status: 'ready' }, ui: { id: 'ui', status: 'blocked' } } });
    expect(pending).toContain('2 lanes');
    expect(pending).toContain('1 blocked');
  });
});

describe('isProjectActive', () => {
  it('handles case-insensitive status', () => {
    expect(isProjectActive({ status: 'Complete' })).toBe(false);
    expect(isProjectActive({ status: 'CANCELLED' })).toBe(false);
    expect(isProjectActive({ status: 'Delivered' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isProjectActive(null)).toBe(false);
  });

  it('returns true for active project', () => {
    expect(isProjectActive({ status: 'active', phase: 'develop' })).toBe(true);
  });
});

describe('detectWriteRisk', () => {
  it('detects high risk for dependency files', () => {
    expect(detectWriteRisk({ file_path: 'package.json' }).level).toBe('high');
    expect(detectWriteRisk({ file_path: 'requirements.txt' }).level).toBe('high');
  });

  it('detects low risk for utilities', () => {
    expect(detectWriteRisk({ file_path: 'src/utils/format.ts' }).level).toBe('low');
  });

  it('does not false-positive on non-API URLs in paths', () => {
    // After fix: StripePattern should not be high risk
    const result = detectWriteRisk({ file_path: 'src/components/StripePattern.tsx', content: 'export default function StripePattern() {}' });
    expect(result.level).not.toBe('high');
  });
});

describe('messageLooksInteractive', () => {
  it('detects question marks', () => {
    expect(messageLooksInteractive('계속할까요?')).toBe(true);
    expect(messageLooksInteractive('do you want to continue?')).toBe(true);
  });

  it('detects approval keywords', () => {
    expect(messageLooksInteractive('waiting for approval')).toBe(true);
    expect(messageLooksInteractive('확인해주세요')).toBe(true);
  });

  it('returns false for non-interactive messages', () => {
    expect(messageLooksInteractive('task completed')).toBe(false);
    expect(messageLooksInteractive('')).toBe(false);
  });

  it('avoids substring false positives', () => {
    expect(messageLooksInteractive('confirmed the deployment')).toBe(false);
    expect(messageLooksInteractive('approved the PR')).toBe(false);
    expect(messageLooksInteractive('확인 완료')).toBe(false);
    expect(messageLooksInteractive('do you want to continue?')).toBe(true);
  });
});

describe('appendRecent', () => {
  it('prepends entry and limits size', () => {
    const list = [1, 2, 3];
    const result = appendRecent(list, 0, 3);
    expect(result).toEqual([0, 1, 2]);
  });

  it('handles empty list', () => {
    expect(appendRecent([], 'a')).toEqual(['a']);
  });
});

describe('state persistence round-trip', () => {
  it('write then read preserves all phases without corruption', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'forge-roundtrip-'));

    try {
      for (const phase of PHASE_SEQUENCE) {
        const written = writeForgeState(tmpDir, { phase, mode: 'build', status: 'active' });
        const read = readForgeState(tmpDir);
        expect(read.phase_id).toBe(phase);
        // Critical: phase should not shift on round-trip
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// HOOK INTEGRATION TESTS: untested hooks
// ============================================================

describe('phase-detector hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('suppresses output for non-forge messages', () => {
    const output = runHook('phase-detector.mjs', tmpDir, { message: 'hello world' });
    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
  });

  it('detects forge keyword and returns context', () => {
    writeState(tmpDir, { phase: 'develop', status: 'active' });
    const output = runHook('phase-detector.mjs', tmpDir, { message: 'forge status' });
    expect(output.hookSpecificOutput.additionalContext).toContain('[Forge]');
  });

  it('detects Korean forge trigger', () => {
    writeState(tmpDir, { phase: 'develop', status: 'active' });
    const output = runHook('phase-detector.mjs', tmpDir, { message: '포지 상태' });
    expect(output.hookSpecificOutput.additionalContext).toContain('[Forge]');
  });

  it('refreshes tier on non-forge follow-up messages when runtime exists', () => {
    writeState(tmpDir, {
      phase: 'delivery',
      phase_id: 'delivery',
      phase_name: 'delivery',
      status: 'active',
    });

    runHook('phase-detector.mjs', tmpDir, { message: 'forge status' });
    let runtime = JSON.parse(readFileSync(join(tmpDir, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.active_tier).toBe('full');

    const output = runHook('phase-detector.mjs', tmpDir, { message: 'fix this bug' });
    expect(output.suppressOutput).toBe(true);

    runtime = JSON.parse(readFileSync(join(tmpDir, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.active_tier).toBe('light');
  });

  it('includes company-mode gate and blocker hints for forge requests', () => {
    writeState(tmpDir, { phase: 'delivery', phase_id: 'delivery', phase_name: 'delivery', status: 'active' });
    writeRuntimeState(tmpDir, {
      company_mode: 'autonomous_company',
      active_gate: 'delivery_readiness',
      delivery_readiness: 'blocked',
      customer_blockers: [{ summary: 'Confirm launch copy' }],
      internal_blockers: [{ summary: 'Security blocker remains' }],
    });

    const output = runHook('phase-detector.mjs', tmpDir, { message: 'forge status' });
    expect(output.hookSpecificOutput.additionalContext).toContain('auto');
    expect(output.hookSpecificOutput.additionalContext).toContain('gate:customer_review');
    expect(output.hookSpecificOutput.additionalContext).toContain('c1');
    expect(output.hookSpecificOutput.additionalContext).toContain('i1');

    const runtime = JSON.parse(readFileSync(join(tmpDir, '.forge', 'runtime.json'), 'utf8'));
    expect(runtime.last_compact_context).toContain('gate:customer_review');
  });

  it('routes forge requests toward continue when customer blockers are present', () => {
    writeState(tmpDir, { phase: 'discovery', phase_id: 'discovery', phase_name: 'discovery', status: 'active' });
    writeRuntimeState(tmpDir, {
      company_mode: 'autonomous_company',
      active_gate: 'customer_review',
      active_gate_owner: 'pm',
      customer_blockers: [{ summary: 'Clarify must-have billing behavior' }],
      internal_blockers: [],
    });

    const output = runHook('phase-detector.mjs', tmpDir, { message: 'forge' });
    expect(output.hookSpecificOutput.additionalContext).toContain('next:pm');
    expect(output.hookSpecificOutput.additionalContext).toContain('→ forge:continue');
  });

  it('keeps forge requests on the active internal phase when customer blockers exist but ownership is internal', () => {
    writeState(tmpDir, { phase: 'fix', phase_id: 'fix', phase_name: 'fix', status: 'active' });
    writeRuntimeState(tmpDir, {
      company_mode: 'autonomous_company',
      active_gate: 'implementation_readiness',
      active_gate_owner: 'lead-dev',
      customer_blockers: [{ summary: 'Need pricing signoff' }],
      internal_blockers: [],
    });

    const output = runHook('phase-detector.mjs', tmpDir, { message: 'forge status' });
    expect(output.hookSpecificOutput.additionalContext).toContain('next:lead-dev');
    expect(output.hookSpecificOutput.additionalContext).toContain('→ forge:fix');
  });

  it('surfaces gate-aware staffing in forge request context', () => {
    writeState(tmpDir, { phase: 'delivery', phase_id: 'delivery', phase_name: 'delivery', status: 'active' });
    writeRuntimeState(tmpDir, {
      company_mode: 'autonomous_company',
      active_gate: 'security',
      internal_blockers: [{ summary: 'Auth issue remains' }],
    });

    const output = runHook('phase-detector.mjs', tmpDir, { message: 'forge status' });
    expect(output.hookSpecificOutput.additionalContext).toContain('[ceo, tech-writer, qa]');
  });

  it('derives PM ownership for customer blockers even without explicit session brief', () => {
    writeState(tmpDir, { phase: 'discovery', phase_id: 'discovery', phase_name: 'discovery', status: 'active' });
    writeRuntimeState(tmpDir, {
      company_mode: 'autonomous_company',
      customer_blockers: [{ summary: 'Clarify paid plan requirements' }],
      internal_blockers: [],
    });

    const runtime = readRuntimeState(tmpDir);
    expect(runtime.next_session_owner).toBe('pm');
  });
});

describe('code-rules-guard hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('surfaces code-rules guidance for full-tier high-risk writes', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    writeFileSync(join(tmpDir, '.forge', 'code-rules.md'), '# rules\n');

    const output = runHook('code-rules-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'package.json',
        content: '{"dependencies":{"new-lib":"1.0.0"}}',
      },
    }, {
      env: { FORGE_TIER: 'full' },
    });

    expect(output.hookSpecificOutput.additionalContext).toContain('code-rules');
  });

  it('suppresses output when code-rules are missing', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });

    const output = runHook('code-rules-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'package.json',
        content: '{"dependencies":{"new-lib":"1.0.0"}}',
      },
    }, {
      env: { FORGE_TIER: 'full' },
    });

    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toBeUndefined();
  });

  it('suppresses output below full tier', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'medium' });
    writeFileSync(join(tmpDir, '.forge', 'code-rules.md'), '# rules\n');

    const output = runHook('code-rules-guard.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'package.json',
        content: '{"dependencies":{"new-lib":"1.0.0"}}',
      },
    }, {
      env: { FORGE_TIER: 'medium' },
    });

    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toBeUndefined();
  });
});

describe('malformed stdin handling', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns safe JSON for empty stdin', () => {
    const result = runHookRawInput('phase-detector.mjs', tmpDir, '');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');

    const outputs = parseJsonLines(result.stdout);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].continue).toBe(true);
    expect(outputs[0].suppressOutput).toBe(true);
  });

  it('returns safe JSON for invalid JSON stdin', () => {
    const result = runHookRawInput('phase-detector.mjs', tmpDir, 'not json');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');

    const outputs = parseJsonLines(result.stdout);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].continue).toBe(true);
    expect(outputs[0].suppressOutput).toBe(true);
  });
});

describe('contract-guard hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('suppresses output when no contracts exist', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    const output = runHook('contract-guard.mjs', tmpDir, { file_path: 'src/app.ts' }, { env: { FORGE_TIER: 'full' } });
    expect(output.continue).toBe(true);
  });

  it('lists contracts when they exist', () => {
    writeState(tmpDir, { phase: 'develop', tier: 'full' });
    mkdirSync(join(tmpDir, '.forge', 'contracts'), { recursive: true });
    writeFileSync(join(tmpDir, '.forge', 'contracts', 'api.ts'), 'export interface API {}');
    writeFileSync(join(tmpDir, '.forge', 'runtime.json'), JSON.stringify({ active_tier: 'full', version: 2 }));

    const output = runHook('contract-guard.mjs', tmpDir, { file_path: 'src/app.ts', content: 'important code' }, { env: { FORGE_TIER: 'full' } });
    expect(output.hookSpecificOutput?.additionalContext).toBeTruthy();
    expect(output.hookSpecificOutput.additionalContext).toContain('api.ts');
  });
});

describe('session-end hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('succeeds without forge state', () => {
    const output = runHook('session-end.mjs', tmpDir);
    expect(output.continue).toBe(true);
  });

  it('succeeds with forge state', () => {
    writeState(tmpDir, { phase: 'develop', status: 'active' });
    const output = runHook('session-end.mjs', tmpDir);
    expect(output.continue).toBe(true);
  });

  it('cleans generated runtime artifacts but preserves forge state and source files', () => {
    writeState(tmpDir, { phase: 'develop', status: 'active' });
    mkdirSync(join(tmpDir, '.forge', 'session-artifacts'), { recursive: true });
    mkdirSync(join(tmpDir, '.forge', 'session-logs'), { recursive: true });
    mkdirSync(join(tmpDir, '.forge', 'session-state'), { recursive: true });
    mkdirSync(join(tmpDir, 'scripts'), { recursive: true });

    writeFileSync(join(tmpDir, '.forge', 'session-artifacts', 'review.md'), '# artifact\n');
    writeFileSync(join(tmpDir, '.forge', 'session-logs', 'turns.jsonl'), '{}\n');
    writeFileSync(join(tmpDir, '.forge', 'session-state', 'hud-state.json'), '{}\n');
    writeFileSync(join(tmpDir, '.forge', 'errors.log'), 'oops\n');
    writeFileSync(join(tmpDir, 'scripts', 'keep.mjs'), 'export const keep = true;\n');

    const output = runHook('session-end.mjs', tmpDir);
    expect(output.continue).toBe(true);

    expect(existsSync(join(tmpDir, '.forge', 'state.json'))).toBe(true);
    expect(existsSync(join(tmpDir, '.forge', 'runtime.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'scripts', 'keep.mjs'))).toBe(true);

    expect(existsSync(join(tmpDir, '.forge', 'session-artifacts', 'review.md'))).toBe(false);
    expect(existsSync(join(tmpDir, '.forge', 'session-logs', 'turns.jsonl'))).toBe(false);
    expect(existsSync(join(tmpDir, '.forge', 'session-state', 'hud-state.json'))).toBe(false);
    expect(existsSync(join(tmpDir, '.forge', 'errors.log'))).toBe(false);
  });
});

describe('context-manager hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('succeeds without forge state', () => {
    const output = runHook('context-manager.mjs', tmpDir);
    expect(output.continue).toBe(true);
  });

  it('does not persist unused checkpoints when state exists', () => {
    writeState(tmpDir, { phase: 'develop', status: 'active' });
    const output = runHook('context-manager.mjs', tmpDir, {}, { env: { FORGE_TIER: 'full' } });
    expect(output.continue).toBe(true);
    expect(existsSync(join(tmpDir, '.forge', 'checkpoints'))).toBe(false);
    expect(output.additionalContext).not.toContain('checkpoint');
  });
});

describe('stop-failure hook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('succeeds and outputs valid JSON', () => {
    const result = runHookRaw('stop-failure.mjs', tmpDir, { error: 'something went wrong' });
    expect(result.exitCode).toBe(0);
    const outputs = parseJsonLines(result.stdout);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].continue).toBe(true);
  });

  it('emits exactly one JSON line on stdout', () => {
    const result = runHookRaw('stop-failure.mjs', tmpDir, { error: 'something went wrong' });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');

    const outputs = parseJsonLines(result.stdout);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toEqual({ continue: true, suppressOutput: true });
  });
});

// ── Phase gate enforcement ──

describe('checkPhaseGate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns canAdvance=true when no gate defined for phase', () => {
    const result = checkPhaseGate(tmpDir, 'intake', 'build');
    expect(result.canAdvance).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('returns canAdvance=false when required artifacts are missing (build)', () => {
    const result = checkPhaseGate(tmpDir, 'develop', 'build');
    expect(result.canAdvance).toBe(false);
    expect(result.missing).toContain('design');
    expect(result.missing).toContain('code-rules.md');
    expect(result.missing).toContain('contracts');
  });

  it('returns canAdvance=true when required artifacts exist (build)', () => {
    const forgeDir = join(tmpDir, '.forge');
    mkdirSync(join(forgeDir, 'design'), { recursive: true });
    mkdirSync(join(forgeDir, 'contracts'), { recursive: true });
    writeFileSync(join(forgeDir, 'code-rules.md'), '# Code Rules\n\nAll code must follow these conventions for consistency and quality across the project.\n\n## Rules\n\n- Use TypeScript strict mode\n');
    const result = checkPhaseGate(tmpDir, 'develop', 'build');
    expect(result.canAdvance).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('returns canAdvance=false when required artifacts are missing (repair)', () => {
    const result = checkPhaseGate(tmpDir, 'isolate', 'repair');
    expect(result.canAdvance).toBe(false);
    expect(result.missing).toContain('evidence');
  });

  it('returns canAdvance=true when required artifacts exist (repair)', () => {
    mkdirSync(join(tmpDir, '.forge', 'evidence'), { recursive: true });
    const result = checkPhaseGate(tmpDir, 'isolate', 'repair');
    expect(result.canAdvance).toBe(true);
  });

  it('checkRepairGate delegates to checkPhaseGate', () => {
    const direct = checkPhaseGate(tmpDir, 'isolate', 'repair');
    const legacy = checkRepairGate(tmpDir, 'isolate');
    expect(direct.canAdvance).toBe(legacy.canAdvance);
    expect(direct.missing).toEqual(legacy.missing);
  });
});

describe('getPhaseGates', () => {
  it('returns BUILD_PHASE_GATES for build mode', () => {
    expect(getPhaseGates('build')).toBe(BUILD_PHASE_GATES);
  });

  it('returns REPAIR_PHASE_GATES for repair mode', () => {
    expect(getPhaseGates('repair')).toBe(REPAIR_PHASE_GATES);
  });

  it('defaults to BUILD_PHASE_GATES', () => {
    expect(getPhaseGates()).toBe(BUILD_PHASE_GATES);
  });

  it('returns EXPRESS_PHASE_GATES for express mode', () => {
    expect(getPhaseGates('express')).toBe(EXPRESS_PHASE_GATES);
  });
});

describe('checkPhaseGate express mode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns canAdvance=true for express plan phase (no gate defined)', () => {
    const result = checkPhaseGate(tmpDir, 'plan', 'express');
    expect(result.canAdvance).toBe(true);
    expect(result.mode).toBe('express');
  });

  it('returns canAdvance=true for express build phase (state.json exists)', () => {
    // state.json must exceed MIN_ARTIFACT_BYTES (100) to pass the gate
    const state = { mode: 'express', phase: 'build', project: 'test', version: '0.2.0', status: 'active', created_at: new Date().toISOString() };
    writeFileSync(join(tmpDir, '.forge', 'state.json'), JSON.stringify(state, null, 2));
    const result = checkPhaseGate(tmpDir, 'build', 'express');
    expect(result.canAdvance).toBe(true);
  });

  it('returns canAdvance=false for express build phase (state.json missing)', () => {
    const result = checkPhaseGate(tmpDir, 'build', 'express');
    expect(result.canAdvance).toBe(false);
    expect(result.missing).toContain('state.json');
  });

  it('returns canAdvance=true for express ship phase (state.json + delivery-report exist)', () => {
    const state = { mode: 'express', phase: 'ship', project: 'test', version: '0.2.0', status: 'active', created_at: new Date().toISOString() };
    writeFileSync(join(tmpDir, '.forge', 'state.json'), JSON.stringify(state, null, 2));
    mkdirSync(join(tmpDir, '.forge', 'delivery-report'), { recursive: true });
    const result = checkPhaseGate(tmpDir, 'ship', 'express');
    expect(result.canAdvance).toBe(true);
  });
});

describe('write-gate express mode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('allows writes in express mode at light tier', () => {
    const forgeDir = join(tmpDir, '.forge');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'express',
      phase: 'build',
      phase_id: 'build',
      phase_name: 'build',
      tier: 'light',
      status: 'in_progress',
    }));
    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: join(tmpDir, 'src', 'app.ts'), content: 'code' },
    }, { env: { FORGE_TIER: 'light' } });
    expect(result.hookSpecificOutput?.permissionDecision).not.toBe('deny');
  });
});

describe('write-gate mismatch denies', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('denies writes on mode-phase mismatch', () => {
    const forgeDir = join(tmpDir, '.forge');
    mkdirSync(join(forgeDir, 'design'), { recursive: true });
    mkdirSync(join(forgeDir, 'contracts'), { recursive: true });
    writeFileSync(join(forgeDir, 'code-rules.md'), '# rules');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'repair',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'light',
      status: 'in_progress',
    }));
    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: join(tmpDir, 'src', 'app.ts'), content: 'code' },
    }, { env: { FORGE_TIER: 'light' } });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toMatch(/mismatch/i);
  });
});

describe('compactForgeContext surfaces warnings', () => {
  it('includes mismatch in action when phase does not match mode', () => {
    const state = { mode: 'repair', phase_id: 'develop', spec_approved: true, design_approved: true };
    const context = compactForgeContext(state);
    expect(context).toMatch(/MISMATCH/);
  });

  it('includes gate warning when present in state', () => {
    const state = {
      mode: 'build', phase_id: 'develop', spec_approved: true, design_approved: true,
      _phase_gate_warning: 'Phase develop requires missing artifacts: design',
    };
    const context = compactForgeContext(state);
    expect(context).toMatch(/GATE/);
  });
});

describe('resolvePhase mismatch detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sets mismatch=false when phase belongs to its mode', () => {
    const result = resolvePhase({ mode: 'build', phase_id: 'develop' });
    expect(result.mismatch).toBe(false);
  });

  it('sets mismatch=true when repair mode has a build phase', () => {
    const result = resolvePhase({ mode: 'repair', phase_id: 'develop' });
    expect(result.mismatch).toBe(true);
    expect(result.id).toBe('develop');
  });

  it('sets mismatch=false for shared phases like intake', () => {
    const result = resolvePhase({ mode: 'repair', phase_id: 'intake' });
    expect(result.mismatch).toBe(false);
  });
});

describe('writeForgeState phase validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds _phase_gate_warning when gate requirements are not met', () => {
    const state = {
      mode: 'build',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'light',
    };
    const result = writeForgeState(tmpDir, state);
    expect(result._phase_gate_warning).toMatch(/design/);
    expect(result._phase_gate_warning).toMatch(/code-rules\.md/);
  });

  it('adds _phase_mismatch_warning for mode-phase mismatch', () => {
    const state = {
      mode: 'repair',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'light',
    };
    const result = writeForgeState(tmpDir, state);
    expect(result._phase_mismatch_warning).toMatch(/does not belong to repair/);
  });

  it('does not add warnings when everything is valid', () => {
    const forgeDir = join(tmpDir, '.forge');
    mkdirSync(join(forgeDir, 'evidence'), { recursive: true });
    const state = {
      mode: 'repair',
      phase: 'isolate',
      phase_id: 'isolate',
      phase_name: 'isolate',
      tier: 'light',
    };
    const result = writeForgeState(tmpDir, state);
    expect(result._phase_gate_warning).toBeUndefined();
    expect(result._phase_mismatch_warning).toBeUndefined();
  });
});

describe('write-gate phase gate enforcement', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeWorkspace();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('denies writes when phase gate requirements are not met (light tier)', () => {
    const forgeDir = join(tmpDir, '.forge');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'build',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'light',
      status: 'in_progress',
    }));
    // No design/, code-rules.md, or contracts/ → gate should deny
    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: join(tmpDir, 'src', 'app.ts'), content: 'code' },
    }, { env: { FORGE_TIER: 'light' } });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toMatch(/phase gate/i);
  });

  it('allows writes to .forge/ state files even when gate fails', () => {
    const forgeDir = join(tmpDir, '.forge');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'build',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'light',
      status: 'in_progress',
    }));
    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: join(forgeDir, 'tasks', 'api.md'), content: '# task' },
    }, { env: { FORGE_TIER: 'light' } });
    // Should NOT deny — .forge/ files are exempt
    expect(result.hookSpecificOutput?.permissionDecision).not.toBe('deny');
  });

  it('allows writes when all gate requirements are met', () => {
    const forgeDir = join(tmpDir, '.forge');
    mkdirSync(join(forgeDir, 'design'), { recursive: true });
    mkdirSync(join(forgeDir, 'contracts'), { recursive: true });
    writeFileSync(join(forgeDir, 'code-rules.md'), '# Code Rules\n\nAll code must follow these conventions for consistency and quality across the project.\n\n## Rules\n\n- Use TypeScript strict mode\n');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'build',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'light',
      status: 'in_progress',
    }));
    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: join(tmpDir, 'src', 'app.ts'), content: 'code' },
    }, { env: { FORGE_TIER: 'light' } });
    expect(result.hookSpecificOutput?.permissionDecision).not.toBe('deny');
  });

  it('denies on mode-phase mismatch', () => {
    const forgeDir = join(tmpDir, '.forge');
    // Satisfy all build gates so we hit the mismatch check
    mkdirSync(join(forgeDir, 'design'), { recursive: true });
    mkdirSync(join(forgeDir, 'contracts'), { recursive: true });
    writeFileSync(join(forgeDir, 'code-rules.md'), '# rules');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'repair',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'light',
      status: 'in_progress',
    }));
    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: join(tmpDir, 'src', 'app.ts'), content: 'code' },
    }, { env: { FORGE_TIER: 'light' } });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toMatch(/mismatch/i);
  });

  it('gates Edit tool the same as Write tool', () => {
    const forgeDir = join(tmpDir, '.forge');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'build',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'light',
      status: 'in_progress',
    }));
    // No design/, code-rules.md, or contracts/ → gate should deny
    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Edit',
      tool_input: { file_path: 'src/app.ts', old_string: 'old code', new_string: 'new code' },
    }, { env: { FORGE_TIER: 'light' } });
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toMatch(/phase gate/i);
  });

  it('warns when the active lane has no requirement linkage', () => {
    const forgeDir = join(tmpDir, '.forge');
    mkdirSync(join(forgeDir, 'design'), { recursive: true });
    mkdirSync(join(forgeDir, 'contracts'), { recursive: true });
    mkdirSync(join(forgeDir, 'evidence'), { recursive: true });
    writeFileSync(join(forgeDir, 'contracts', 'api.ts'), 'export interface API {}');
    writeFileSync(join(forgeDir, 'code-rules.md'), '# Code Rules\n\nAll code must follow these conventions for consistency and quality across the project.\n\n## Rules\n\n- Use TypeScript strict mode\n');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'build',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'full',
      status: 'in_progress',
      spec_approved: true,
      design_approved: true,
    }));
    writeRuntimeState(tmpDir, {
      next_lane: 'shared',
      lanes: {
        shared: {
          id: 'shared',
          title: 'Shared utilities',
          status: 'in_progress',
        },
      },
    });

    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: join(tmpDir, 'src', 'app.ts'), content: 'code' },
    }, { env: { FORGE_TIER: 'full' } });

    expect(result.hookSpecificOutput?.permissionDecision).not.toBe('deny');
    expect(result.hookSpecificOutput?.additionalContext).toMatch(/intent warning/i);
    expect(result.hookSpecificOutput?.additionalContext).toMatch(/requirement linkage/i);
  });

  it('denies high-risk writes when the active lane has no requirement linkage', () => {
    const forgeDir = join(tmpDir, '.forge');
    mkdirSync(join(forgeDir, 'design'), { recursive: true });
    mkdirSync(join(forgeDir, 'contracts'), { recursive: true });
    mkdirSync(join(forgeDir, 'evidence'), { recursive: true });
    writeFileSync(join(forgeDir, 'contracts', 'api.ts'), 'export interface API {}');
    writeFileSync(join(forgeDir, 'code-rules.md'), '# Code Rules\n\nAll code must follow these conventions for consistency and quality across the project.\n\n## Rules\n\n- Use TypeScript strict mode\n');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'build',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'full',
      status: 'in_progress',
      spec_approved: true,
      design_approved: true,
    }));
    writeRuntimeState(tmpDir, {
      next_lane: 'shared',
      lanes: {
        shared: {
          id: 'shared',
          title: 'Shared utilities',
          status: 'in_progress',
        },
      },
    });

    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: 'package.json', content: '{"dependencies":{"new-lib":"1.0.0"}}' },
    }, { env: { FORGE_TIER: 'full' } });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toMatch(/intent guard/i);
  });

  it('allows writes when the active lane has requirement linkage', () => {
    const forgeDir = join(tmpDir, '.forge');
    mkdirSync(join(forgeDir, 'design'), { recursive: true });
    mkdirSync(join(forgeDir, 'contracts'), { recursive: true });
    mkdirSync(join(forgeDir, 'evidence'), { recursive: true });
    writeFileSync(join(forgeDir, 'contracts', 'api.ts'), 'export interface API {}');
    writeFileSync(join(forgeDir, 'code-rules.md'), '# Code Rules\n\nAll code must follow these conventions for consistency and quality across the project.\n\n## Rules\n\n- Use TypeScript strict mode\n');
    writeFileSync(join(forgeDir, 'state.json'), JSON.stringify({
      mode: 'build',
      phase: 'develop',
      phase_id: 'develop',
      phase_name: 'develop',
      tier: 'full',
      status: 'in_progress',
      spec_approved: true,
      design_approved: true,
    }));
    writeRuntimeState(tmpDir, {
      next_lane: 'shared',
      lanes: {
        shared: {
          id: 'shared',
          title: 'Shared utilities',
          status: 'in_progress',
          requirement_refs: ['FR-1'],
          acceptance_refs: ['FR-1-AC-1'],
        },
      },
    });

    const result = runHook('write-gate.mjs', tmpDir, {
      tool_name: 'Write',
      tool_input: { file_path: join(tmpDir, 'src', 'app.ts'), content: 'code' },
    }, { env: { FORGE_TIER: 'full' } });

    expect(result.hookSpecificOutput?.permissionDecision).not.toBe('deny');
    expect(result.hookSpecificOutput?.additionalContext || '').not.toMatch(/intent warning/i);
  });
});
