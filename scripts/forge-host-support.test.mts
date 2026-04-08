import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { getForgeHostCapabilities, getForgeHostSupportProfile } from './lib/forge-host-support.mjs';
import { listForgeHostCatalogEntries } from './lib/forge-host-catalog.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

describe('forge host support', () => {
  it('declares codex as degraded while preserving shared continue capability', () => {
    const profile = getForgeHostSupportProfile('codex');

    expect(profile.displayName).toBe('Codex');
    expect(profile.supportLevel).toBe('degraded');
    expect(profile.capabilities.sharedContinue).toBe(true);
    expect(profile.capabilities.sharedStateResume).toBe(true);
    expect(profile.capabilities.pluginManagerInstall).toBe(true);
    expect(profile.capabilities.packagedHookRouting).toBe(true);
    expect(profile.capabilities.sessionHooks).toBe(false);
    expect(profile.capabilities.degradedModes).toContain('runtime_hook_execution_not_observed');
    expect(profile.capabilities.degradedModes).toContain('session_hooks_unverified');
  });

  it('upgrades Gemini and Qwen once their explicit extension surfaces are shipped', () => {
    const gemini = getForgeHostCapabilities('gemini');
    const qwen = getForgeHostSupportProfile('qwen');

    expect(gemini.explicitContinue).toBe(true);
    expect(gemini.sharedContinue).toBe(true);
    expect(gemini.degradedModes).toContain('session_hooks_unverified');
    expect(qwen.displayName).toBe('Qwen Code');
    expect(qwen.supportLevel).toBe('degraded');
    expect(qwen.capabilities.sharedContinue).toBe(true);
    expect(qwen.capabilities.explicitContinue).toBe(true);
  });

  it('normalizes unknown hosts to an explicit unknown profile', () => {
    const profile = getForgeHostSupportProfile('mystery-host');

    expect(profile.hostId).toBe('unknown');
    expect(profile.displayName).toBe('');
    expect(profile.supportLevel).toBe('unknown');
    expect(profile.capabilities.degradedModes).toEqual(['unrecognized_host']);
  });

  it('keeps README host support labels aligned with the host catalog', () => {
    const readme = readFileSync(join(FORGE_ROOT, 'README.md'), 'utf8');

    for (const entry of listForgeHostCatalogEntries()) {
      expect(readme).toContain(`| ${entry.docsLabel} | **${entry.statusLabel}** |`);
    }
  });
});
