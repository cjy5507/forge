import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  buildContinueContext,
  buildContinueDirective,
  renderContinueDirective,
  selectContinueDirective,
} from './lib/forge-continue.mjs';
import { applyHostContext } from './lib/forge-host-context.mjs';
import { writeForgeState, writeRuntimeState } from './lib/forge-session.mjs';

const WORKSPACES = [];
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-continue-'));
  WORKSPACES.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

afterEach(() => {
  while (WORKSPACES.length > 0) {
    rmSync(WORKSPACES.pop(), { recursive: true, force: true });
  }
});

describe('forge continue surface', () => {
  it('selects stale analysis projects for forge:analyze', () => {
    const cwd = makeWorkspace();
    const state = writeForgeState(cwd, {
      project: 'select-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    const runtime = writeRuntimeState(cwd, {
      analysis: {
        last_type: 'impact',
        last_target: 'scripts/write-gate.mjs',
        stale: true,
      },
    }, { state });

    const selected = selectContinueDirective({ cwd, state, runtime });
    expect(selected.skill).toBe('analyze');
    expect(selected.reason).toContain('saved analysis is stale');
  });

  it('renders warm continue directives with saved handoff guidance', () => {
    const output = renderContinueDirective({
      skill: 'continue',
      context: '[Forge] compact context',
      staleTier: 'warm',
    });

    expect(output).toContain('Skill: forge:continue');
    expect(output).toContain('saved handoff');
  });

  it('routes stale analysis to forge:analyze', () => {
    const cwd = makeWorkspace();
    const state = writeForgeState(cwd, {
      project: 'continue-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    const runtime = writeRuntimeState(cwd, {
      analysis: {
        last_type: 'impact',
        last_target: 'scripts/write-gate.mjs',
        stale: true,
      },
      last_compact_context: '[Forge] compact context',
    }, { state });

    const directive = buildContinueDirective({
      cwd,
      state,
      runtime,
      context: runtime.last_compact_context,
    });

    expect(directive.skill).toBe('analyze');
    expect(directive.additionalContext).toContain('Skill: forge:analyze');
    expect(directive.additionalContext).toContain('saved analysis is stale');
  });

  it('builds canonical status context for info resumes', () => {
    const cwd = makeWorkspace();
    const state = writeForgeState(cwd, {
      project: 'status-app',
      mode: 'repair',
      phase: 'complete',
      phase_id: 'complete',
      status: 'delivered',
      spec_approved: true,
      design_approved: true,
    });
    const runtime = writeRuntimeState(cwd, {
      delivery_readiness: 'delivered',
      active_gate: 'customer_review',
    }, { state });

    const context = buildContinueContext({
      cwd,
      state,
      runtime,
      skill: 'info',
    });

    expect(context).toContain('Project delivered');
    expect(context).toContain('Canonical status surface from scripts/forge-status.mjs');
  });

  it('routes delivered projects to forge:info with canonical status context', () => {
    const cwd = makeWorkspace();
    const state = writeForgeState(cwd, {
      project: 'delivered-app',
      mode: 'repair',
      phase: 'complete',
      phase_id: 'complete',
      status: 'delivered',
      spec_approved: true,
      design_approved: true,
    });
    const runtime = writeRuntimeState(cwd, {
      delivery_readiness: 'delivered',
      active_gate: 'customer_review',
    }, { state });

    const directive = buildContinueDirective({ cwd, state, runtime });

    expect(directive.skill).toBe('info');
    expect(directive.additionalContext).toContain('Skill: forge:info');
    expect(directive.additionalContext).toContain('Project delivered');
    expect(directive.additionalContext).toContain('Canonical status surface from scripts/forge-status.mjs');
  });

  it('surfaces cross-host handoff context for explicit resume paths', () => {
    const cwd = makeWorkspace();
    const state = writeForgeState(cwd, {
      project: 'handoff-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    const runtime = applyHostContext({
      last_compact_context: '[Forge] compact context',
      host_context: {
        current_host: 'claude',
      },
    }, {
      hostId: 'codex',
      eventName: 'prompt.submit',
      resumed: false,
    });

    const directive = buildContinueDirective({
      cwd,
      state,
      runtime,
      context: runtime.last_compact_context,
    });

    expect(directive.skill).toBe('continue');
    expect(directive.additionalContext).toContain('Shared .forge handoff: Claude -> Codex');
    expect(directive.additionalContext).toContain('Skill: forge:continue');
  });

  it('exposes a real continue CLI surface', () => {
    const cwd = makeWorkspace();
    const state = writeForgeState(cwd, {
      project: 'cli-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      lanes: {
        api: {
          id: 'api',
          status: 'in_progress',
          owner_role: 'developer',
          handoff_notes: [{ note: 'Resume API integration tests' }],
        },
      },
    }, { state });

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-continue.mjs')], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resume skill: forge:continue');
    expect(result.stdout).toContain('Resume lane api');
  });

  it('emits structured json from the continue CLI surface', () => {
    const cwd = makeWorkspace();
    const state = writeForgeState(cwd, {
      project: 'json-app',
      phase: 'complete',
      phase_id: 'complete',
      mode: 'repair',
      status: 'delivered',
      spec_approved: true,
      design_approved: true,
    });
    writeRuntimeState(cwd, {
      delivery_readiness: 'delivered',
    }, { state });

    const result = spawnSync(process.execPath, [join(FORGE_ROOT, 'scripts', 'forge-continue.mjs'), '--json'], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.active).toBe(true);
    expect(payload.skill).toBe('info');
    expect(payload.message).toBe('forge:info');
  });
});
