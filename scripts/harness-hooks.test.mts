import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
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

describe('forge harness hooks', () => {
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
    ];

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('/Users/joejaeyoung')).toBe(false);
      expect(text.includes('gosusignal-local')).toBe(false);
      expect(text.includes('.agents/plugins/marketplace.json')).toBe(false);
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
    writeState(cwd, { phase: 4.5, phase_name: 'security' });

    const output = runHook('state-restore.mjs', cwd);
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput.additionalContext).toContain('[Forge]');
    expect(output.hookSpecificOutput.additionalContext).toContain('security');

    const normalized = JSON.parse(readFileSync(join(cwd, '.forge', 'state.json'), 'utf8'));
    expect(normalized.phase_id).toBe('security');
    expect(normalized.phase_index).toBe(5);
  });

  it('denies high-risk writes when harness prerequisites are missing in full tier', () => {
    const cwd = makeWorkspace();
    writeState(cwd, { spec_approved: false, design_approved: false });

    const output = runHook('fact-check.mjs', cwd, {
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
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('Missing');
  });

  it('becomes a no-op in light tier for write guards', () => {
    const cwd = makeWorkspace();
    writeState(cwd);

    const output = runHook('fact-check.mjs', cwd, {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/utils/formatDate.ts',
        content: 'export function formatDate() {}',
      },
    }, {
      env: { FORGE_TIER: 'light' },
    });

    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toBeUndefined();
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
    expect(runtime.active_agents['agent-1'].status).toBe('stopped');
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
    expect(output.reason).toContain('still active');
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
});
