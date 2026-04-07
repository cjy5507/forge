import { describe, expect, it } from 'vitest';
import { getForgeHostCapabilities, getForgeHostSupportProfile } from './lib/forge-host-support.mjs';

describe('forge host support', () => {
  it('declares codex as degraded while preserving shared continue capability', () => {
    const profile = getForgeHostSupportProfile('codex');

    expect(profile.displayName).toBe('Codex');
    expect(profile.supportLevel).toBe('degraded');
    expect(profile.capabilities.sharedContinue).toBe(true);
    expect(profile.capabilities.sharedStateResume).toBe(true);
    expect(profile.capabilities.sessionHooks).toBe(false);
    expect(profile.capabilities.degradedModes).toContain('session_hooks_unverified');
  });

  it('keeps Gemini and Qwen as planned hosts until their surfaces ship', () => {
    const gemini = getForgeHostCapabilities('gemini');
    const qwen = getForgeHostSupportProfile('qwen');

    expect(gemini.explicitContinue).toBe(false);
    expect(gemini.degradedModes).toContain('host_surface_not_shipped');
    expect(qwen.displayName).toBe('Qwen Code');
    expect(qwen.supportLevel).toBe('planned');
    expect(qwen.capabilities.sharedContinue).toBe(false);
  });

  it('normalizes unknown hosts to an explicit unknown profile', () => {
    const profile = getForgeHostSupportProfile('mystery-host');

    expect(profile.hostId).toBe('unknown');
    expect(profile.displayName).toBe('');
    expect(profile.supportLevel).toBe('unknown');
    expect(profile.capabilities.degradedModes).toEqual(['unrecognized_host']);
  });
});
