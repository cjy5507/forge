import {
  normalizeHostContext,
  normalizeHostId,
  requireString,
} from './forge-io.mjs';

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

export function getForgeHostSupportProfile(hostId = '') {
  const profile = getForgeHostCatalogEntry(hostId);
  return {
    hostId: profile.hostId,
    displayName: profile.displayName,
    supportLevel: profile.supportLevel,
    packagePaths: profile.packagePaths,
    capabilities: profile.capabilities,
    determinismFloor: profile.determinismFloor,
    observedLifecycle: profile.observedLifecycle,
  };
}

export function getForgeHostCapabilities(hostId = '') {
  return getForgeHostSupportProfile(hostId).capabilities;
}

export function getForgeHostDeterminismFloor(hostId = '') {
  return getForgeHostSupportProfile(hostId).determinismFloor;
}

export function getForgeHostAdapterContract(hostId = '') {
  const profile = getForgeHostSupportProfile(hostId);
  return {
    hostId: profile.hostId,
    supportLevel: profile.supportLevel,
    hookLifecycleObserved: Boolean(profile.observedLifecycle?.hookLifecycleObserved),
    stopSemanticsObserved: Boolean(profile.observedLifecycle?.stopSemanticsObserved),
    subagentLifecycleObserved: Boolean(profile.observedLifecycle?.subagentLifecycleObserved),
    degradedModes: [...(profile.capabilities?.degradedModes || [])],
    determinismFloor: {
      ...profile.determinismFloor,
    },
  };
}

export function describeForgeHostDegradedExecution(hostId = '') {
  const contract = getForgeHostAdapterContract(hostId);
  if (contract.hostId === 'unknown') {
    return 'Unknown host: Forge can only rely on explicit CLI surfaces.';
  }
  if (contract.supportLevel !== 'degraded') {
    return '';
  }

  const missing = [];
  if (!contract.hookLifecycleObserved) missing.push('hooks');
  if (!contract.stopSemanticsObserved) missing.push('stop semantics');
  if (!contract.subagentLifecycleObserved) missing.push('subagent lifecycle');

  if (missing.length === 0) {
    return '';
  }

  return `${contract.hostId} runs with bounded degraded behavior: ${missing.join(', ')} not observed.`;
}

export function resolveForgeHostPosture(hostId = '') {
  const contract = getForgeHostAdapterContract(hostId);
  if (contract.hostId === 'unknown') {
    return 'unknown_host';
  }
  return contract.supportLevel === 'verified' ? 'verified_path' : 'bounded_degraded';
}

export function applyForgeHostAdapter(runtime = {}, hostId = '') {
  const posture = resolveForgeHostPosture(hostId);
  return {
    ...runtime,
    harness_policy: {
      ...(runtime?.harness_policy || {}),
      host_posture: posture,
    },
  };
}

export function detectHostId(input = {}, env = process.env) {
  const explicit = normalizeHostId(
    input?.host_id || input?.hostId || input?.host || '',
  );
  if (explicit && explicit !== 'unknown') {
    return explicit;
  }

  if (requireString(env?.CLAUDE_PLUGIN_ROOT)) {
    return 'claude';
  }

  if (requireString(env?.CODEX_THREAD_ID) || requireString(env?.CODEX_SESSION_ID)) {
    return 'codex';
  }

  return '';
}

export function applyHostContext(runtime = {}, { hostId = '', eventName = '', resumed = false } = {}) {
  const current = normalizeHostContext(runtime?.host_context);
  const nextHost = normalizeHostId(hostId);
  if (!nextHost || nextHost === 'unknown') {
    return runtime;
  }

  const currentHost = normalizeHostId(current.current_host);
  const previousHost = currentHost && currentHost !== nextHost
    ? currentHost
    : normalizeHostId(current.previous_host);
  const now = new Date().toISOString();

  return {
    ...runtime,
    host_context: {
      ...current,
      current_host: nextHost,
      previous_host: previousHost,
      last_event_host: nextHost,
      last_event_name: eventName || current.last_event_name || '',
      last_resume_host: resumed ? nextHost : normalizeHostId(current.last_resume_host),
      last_resume_at: resumed ? now : requireString(current.last_resume_at),
    },
  };
}

function formatHostName(hostId = '') {
  const profile = getForgeHostSupportProfile(hostId);
  return profile.hostId === 'unknown' ? '' : profile.displayName;
}

export function describeCrossHostResume(runtime = {}) {
  const hostContext = normalizeHostContext(runtime?.host_context);
  if (!hostContext.current_host || !hostContext.previous_host) {
    return '';
  }
  if (hostContext.current_host === hostContext.previous_host) {
    return '';
  }

  const previous = formatHostName(hostContext.previous_host);
  const current = formatHostName(hostContext.current_host);
  if (!previous || !current) {
    return '';
  }

  return `Shared .forge handoff: ${previous} -> ${current}. Continue uses the same persisted project state.`;
}
