import { normalizeHostId } from './forge-io.mjs';

const HOST_SUPPORT_PROFILES = Object.freeze({
  claude: Object.freeze({
    hostId: 'claude',
    displayName: 'Claude',
    supportLevel: 'verified',
    capabilities: Object.freeze({
      sharedContinue: true,
      sessionHooks: true,
      toolHooks: true,
      subagentLifecycle: true,
      stopInterception: true,
      workspaceHints: true,
      explicitContinue: true,
      sharedStateResume: true,
      renderedBriefInjection: true,
      degradedModes: Object.freeze([]),
    }),
  }),
  codex: Object.freeze({
    hostId: 'codex',
    displayName: 'Codex',
    supportLevel: 'degraded',
    capabilities: Object.freeze({
      sharedContinue: true,
      sessionHooks: false,
      toolHooks: false,
      subagentLifecycle: false,
      stopInterception: false,
      workspaceHints: false,
      explicitContinue: true,
      sharedStateResume: true,
      renderedBriefInjection: false,
      degradedModes: Object.freeze([
        'session_hooks_unverified',
        'tool_hooks_unverified',
        'subagent_lifecycle_unverified',
        'stop_interception_unverified',
        'rendered_brief_injection_unverified',
      ]),
    }),
  }),
  gemini: Object.freeze({
    hostId: 'gemini',
    displayName: 'Gemini CLI',
    supportLevel: 'degraded',
    capabilities: Object.freeze({
      sharedContinue: true,
      sessionHooks: false,
      toolHooks: false,
      subagentLifecycle: false,
      stopInterception: false,
      workspaceHints: false,
      explicitContinue: true,
      sharedStateResume: true,
      renderedBriefInjection: false,
      degradedModes: Object.freeze([
        'session_hooks_unverified',
        'tool_hooks_unverified',
        'subagent_lifecycle_unverified',
        'stop_interception_unverified',
        'rendered_brief_injection_unverified',
      ]),
    }),
  }),
  qwen: Object.freeze({
    hostId: 'qwen',
    displayName: 'Qwen Code',
    supportLevel: 'planned',
    capabilities: Object.freeze({
      sharedContinue: false,
      sessionHooks: false,
      toolHooks: false,
      subagentLifecycle: false,
      stopInterception: false,
      workspaceHints: false,
      explicitContinue: false,
      sharedStateResume: false,
      renderedBriefInjection: false,
      degradedModes: Object.freeze(['host_surface_not_shipped']),
    }),
  }),
  unknown: Object.freeze({
    hostId: 'unknown',
    displayName: '',
    supportLevel: 'unknown',
    capabilities: Object.freeze({
      sharedContinue: false,
      sessionHooks: false,
      toolHooks: false,
      subagentLifecycle: false,
      stopInterception: false,
      workspaceHints: false,
      explicitContinue: false,
      sharedStateResume: false,
      renderedBriefInjection: false,
      degradedModes: Object.freeze(['unrecognized_host']),
    }),
  }),
});

export function getForgeHostSupportProfile(hostId = '') {
  const normalized = normalizeHostId(hostId, 'unknown') || 'unknown';
  const profile = HOST_SUPPORT_PROFILES[normalized] || HOST_SUPPORT_PROFILES.unknown;

  return {
    hostId: profile.hostId,
    displayName: profile.displayName,
    supportLevel: profile.supportLevel,
    capabilities: {
      ...profile.capabilities,
      degradedModes: [...profile.capabilities.degradedModes],
    },
  };
}

export function getForgeHostCapabilities(hostId = '') {
  return getForgeHostSupportProfile(hostId).capabilities;
}
