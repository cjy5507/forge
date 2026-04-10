import { normalizeHostId } from './forge-io.mjs';

const VERIFIED_LABEL = 'Verified';
const DEGRADED_LABEL = 'Degraded support';
const UNKNOWN_LABEL = 'Unknown';

const SHARED_PACKAGE_PATHS = Object.freeze([
  '.mcp.json',
  'hooks/hooks.json',
  'hooks/run-hook.mjs',
]);

const DEGRADED_CAPABILITIES = Object.freeze({
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
});

const DEGRADED_MODES_COMMON = Object.freeze([
  'session_hooks_unverified',
  'tool_hooks_unverified',
  'subagent_lifecycle_unverified',
  'stop_interception_unverified',
  'rendered_brief_injection_unverified',
]);

const DETERMINISM_ALL_TRUE = Object.freeze({
  sharedContinue: true,
  sharedStatus: true,
  sharedAnalyze: true,
  decisionTraceVisibility: true,
  verificationVisibility: true,
  recoveryVisibility: true,
});

const DETERMINISM_ALL_FALSE = Object.freeze({
  sharedContinue: false,
  sharedStatus: false,
  sharedAnalyze: false,
  decisionTraceVisibility: false,
  verificationVisibility: false,
  recoveryVisibility: false,
});

const LIFECYCLE_ALL_FALSE = Object.freeze({
  hookLifecycleObserved: false,
  stopSemanticsObserved: false,
  subagentLifecycleObserved: false,
});

function degradedHost(id, displayName, docsLabel, packagePaths, capOverrides = {}, extraDegradedModes = []) {
  return Object.freeze({
    hostId: id,
    displayName,
    docsLabel,
    supportLevel: 'degraded',
    statusLabel: DEGRADED_LABEL,
    packagePaths: Object.freeze(packagePaths),
    capabilities: Object.freeze({
      ...DEGRADED_CAPABILITIES,
      ...capOverrides,
      degradedModes: Object.freeze([...extraDegradedModes, ...DEGRADED_MODES_COMMON]),
    }),
    determinismFloor: DETERMINISM_ALL_TRUE,
    observedLifecycle: LIFECYCLE_ALL_FALSE,
  });
}

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
    determinismFloor: DETERMINISM_ALL_TRUE,
    observedLifecycle: Object.freeze({
      hookLifecycleObserved: true,
      stopSemanticsObserved: true,
      subagentLifecycleObserved: true,
    }),
  }),
  codex: degradedHost('codex', 'Codex', 'Codex',
    ['.codex-plugin/plugin.json', '.codex-plugin/hooks/hooks.json'],
    { pluginManagerInstall: true, packagedHookRouting: true },
    ['runtime_hook_execution_not_observed'],
  ),
  gemini: degradedHost('gemini', 'Gemini CLI', 'Gemini CLI',
    ['gemini-extension.json', 'GEMINI.md', 'commands/forge/continue.toml'],
  ),
  qwen: degradedHost('qwen', 'Qwen Code', 'Qwen Code',
    ['qwen-extension.json', 'QWEN.md', 'qwen-commands/forge/continue.md'],
  ),
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
    determinismFloor: DETERMINISM_ALL_FALSE,
    observedLifecycle: LIFECYCLE_ALL_FALSE,
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
