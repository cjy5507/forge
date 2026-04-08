import { normalizeHostId } from './forge-io.mjs';

const VERIFIED_LABEL = 'Verified';
const DEGRADED_LABEL = 'Degraded support';
const UNKNOWN_LABEL = 'Unknown';

const SHARED_PACKAGE_PATHS = Object.freeze([
  '.mcp.json',
  'hooks/hooks.json',
  'hooks/run-hook.mjs',
]);

const HOST_CATALOG = Object.freeze({
  claude: Object.freeze({
    hostId: 'claude',
    displayName: 'Claude',
    docsLabel: 'Claude Code',
    supportLevel: 'verified',
    statusLabel: VERIFIED_LABEL,
    packagePaths: Object.freeze([
      '.claude-plugin/plugin.json',
      '.claude-plugin/marketplace.json',
    ]),
    capabilities: Object.freeze({
      sharedContinue: true,
      sessionHooks: true,
      toolHooks: true,
      subagentLifecycle: true,
      stopInterception: true,
      pluginManagerInstall: true,
      packagedHookRouting: true,
      workspaceHints: true,
      explicitContinue: true,
      sharedStateResume: true,
      renderedBriefInjection: true,
      degradedModes: Object.freeze([]),
    }),
    determinismFloor: Object.freeze({
      sharedContinue: true,
      sharedStatus: true,
      sharedAnalyze: true,
      decisionTraceVisibility: true,
      verificationVisibility: true,
      recoveryVisibility: true,
    }),
    observedLifecycle: Object.freeze({
      hookLifecycleObserved: true,
      stopSemanticsObserved: true,
      subagentLifecycleObserved: true,
    }),
  }),
  codex: Object.freeze({
    hostId: 'codex',
    displayName: 'Codex',
    docsLabel: 'Codex',
    supportLevel: 'degraded',
    statusLabel: DEGRADED_LABEL,
    packagePaths: Object.freeze([
      '.codex-plugin/plugin.json',
      '.codex-plugin/hooks/hooks.json',
    ]),
    capabilities: Object.freeze({
      sharedContinue: true,
      sessionHooks: false,
      toolHooks: false,
      subagentLifecycle: false,
      stopInterception: false,
      pluginManagerInstall: true,
      packagedHookRouting: true,
      workspaceHints: false,
      explicitContinue: true,
      sharedStateResume: true,
      renderedBriefInjection: false,
      degradedModes: Object.freeze([
        'runtime_hook_execution_not_observed',
        'session_hooks_unverified',
        'tool_hooks_unverified',
        'subagent_lifecycle_unverified',
        'stop_interception_unverified',
        'rendered_brief_injection_unverified',
      ]),
    }),
    determinismFloor: Object.freeze({
      sharedContinue: true,
      sharedStatus: true,
      sharedAnalyze: true,
      decisionTraceVisibility: true,
      verificationVisibility: true,
      recoveryVisibility: true,
    }),
    observedLifecycle: Object.freeze({
      hookLifecycleObserved: false,
      stopSemanticsObserved: false,
      subagentLifecycleObserved: false,
    }),
  }),
  gemini: Object.freeze({
    hostId: 'gemini',
    displayName: 'Gemini CLI',
    docsLabel: 'Gemini CLI',
    supportLevel: 'degraded',
    statusLabel: DEGRADED_LABEL,
    packagePaths: Object.freeze([
      'gemini-extension.json',
      'GEMINI.md',
      'commands/forge/continue.toml',
    ]),
    capabilities: Object.freeze({
      sharedContinue: true,
      sessionHooks: false,
      toolHooks: false,
      subagentLifecycle: false,
      stopInterception: false,
      pluginManagerInstall: false,
      packagedHookRouting: false,
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
    determinismFloor: Object.freeze({
      sharedContinue: true,
      sharedStatus: true,
      sharedAnalyze: true,
      decisionTraceVisibility: true,
      verificationVisibility: true,
      recoveryVisibility: true,
    }),
    observedLifecycle: Object.freeze({
      hookLifecycleObserved: false,
      stopSemanticsObserved: false,
      subagentLifecycleObserved: false,
    }),
  }),
  qwen: Object.freeze({
    hostId: 'qwen',
    displayName: 'Qwen Code',
    docsLabel: 'Qwen Code',
    supportLevel: 'degraded',
    statusLabel: DEGRADED_LABEL,
    packagePaths: Object.freeze([
      'qwen-extension.json',
      'QWEN.md',
      'qwen-commands/forge/continue.md',
    ]),
    capabilities: Object.freeze({
      sharedContinue: true,
      sessionHooks: false,
      toolHooks: false,
      subagentLifecycle: false,
      stopInterception: false,
      pluginManagerInstall: false,
      packagedHookRouting: false,
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
    determinismFloor: Object.freeze({
      sharedContinue: true,
      sharedStatus: true,
      sharedAnalyze: true,
      decisionTraceVisibility: true,
      verificationVisibility: true,
      recoveryVisibility: true,
    }),
    observedLifecycle: Object.freeze({
      hookLifecycleObserved: false,
      stopSemanticsObserved: false,
      subagentLifecycleObserved: false,
    }),
  }),
  unknown: Object.freeze({
    hostId: 'unknown',
    displayName: '',
    docsLabel: 'Unknown',
    supportLevel: 'unknown',
    statusLabel: UNKNOWN_LABEL,
    packagePaths: Object.freeze([]),
    capabilities: Object.freeze({
      sharedContinue: false,
      sessionHooks: false,
      toolHooks: false,
      subagentLifecycle: false,
      stopInterception: false,
      pluginManagerInstall: false,
      packagedHookRouting: false,
      workspaceHints: false,
      explicitContinue: false,
      sharedStateResume: false,
      renderedBriefInjection: false,
      degradedModes: Object.freeze(['unrecognized_host']),
    }),
    determinismFloor: Object.freeze({
      sharedContinue: false,
      sharedStatus: false,
      sharedAnalyze: false,
      decisionTraceVisibility: false,
      verificationVisibility: false,
      recoveryVisibility: false,
    }),
    observedLifecycle: Object.freeze({
      hookLifecycleObserved: false,
      stopSemanticsObserved: false,
      subagentLifecycleObserved: false,
    }),
  }),
});

function cloneCatalogEntry(entry) {
  return {
    hostId: entry.hostId,
    displayName: entry.displayName,
    docsLabel: entry.docsLabel,
    supportLevel: entry.supportLevel,
    statusLabel: entry.statusLabel,
    packagePaths: [...entry.packagePaths],
    capabilities: {
      ...entry.capabilities,
      degradedModes: [...entry.capabilities.degradedModes],
    },
    determinismFloor: { ...entry.determinismFloor },
    observedLifecycle: { ...entry.observedLifecycle },
  };
}

export function getForgeHostCatalogEntry(hostId = '') {
  const normalized = normalizeHostId(hostId, 'unknown') || 'unknown';
  return cloneCatalogEntry(HOST_CATALOG[normalized] || HOST_CATALOG.unknown);
}

export function listForgeHostCatalogEntries() {
  return ['claude', 'codex', 'gemini', 'qwen'].map(hostId => getForgeHostCatalogEntry(hostId));
}

export function getForgePackagedPaths() {
  return [...new Set([
    ...SHARED_PACKAGE_PATHS,
    ...listForgeHostCatalogEntries().flatMap(entry => entry.packagePaths),
  ])];
}

export function getForgeAllowedHiddenTopLevelEntries() {
  return [...new Set(
    getForgePackagedPaths()
      .map(path => path.split(/[\\/]/)[0])
      .filter(segment => segment.startsWith('.')),
  )];
}
