const PROFILE_ORDER = Object.freeze({
  minimal: 0,
  standard: 1,
  strict: 2,
});

const HOOK_DEFINITIONS = Object.freeze({
  'state-restore': Object.freeze({ eventName: 'SessionStart', profile: 'minimal' }),
  'phase-detector': Object.freeze({ eventName: 'UserPromptSubmit', profile: 'minimal' }),
  'write-gate': Object.freeze({ eventName: 'PreToolUse', profile: 'minimal' }),
  'contract-guard': Object.freeze({ eventName: 'PostToolUse', profile: 'standard' }),
  'code-rules-guard': Object.freeze({ eventName: 'PostToolUse', profile: 'standard' }),
  'post-edit-accumulator': Object.freeze({ eventName: 'PostToolUse', profile: 'minimal' }),
  'tool-failure': Object.freeze({ eventName: 'PostToolUseFailure', profile: 'standard' }),
  'subagent-start': Object.freeze({ eventName: 'SubagentStart', profile: 'standard' }),
  'subagent-stop': Object.freeze({ eventName: 'SubagentStop', profile: 'standard' }),
  'context-manager': Object.freeze({ eventName: 'PreCompact', profile: 'strict' }),
  'lsp-symbol-guard': Object.freeze({ eventName: 'PreToolUse', profile: 'standard' }),
  'stop-guard': Object.freeze({ eventName: 'Stop', profile: 'minimal' }),
  'stop-failure': Object.freeze({ eventName: 'StopFailure', profile: 'strict' }),
  'session-end': Object.freeze({ eventName: 'SessionEnd', profile: 'minimal' }),
});

function normalizeHookName(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function getForgeHookDefinitions() {
  return Object.fromEntries(Object.entries(HOOK_DEFINITIONS).map(([key, value]) => [key, { ...value }]));
}

export function getForgeHookNames() {
  return Object.keys(HOOK_DEFINITIONS);
}

export function getForgeHookDefinition(hookName = '') {
  const normalized = normalizeHookName(hookName);
  const definition = HOOK_DEFINITIONS[normalized];
  return definition ? { ...definition } : null;
}

export function normalizeHookProfile(value = '') {
  const normalized = String(value || 'standard').trim().toLowerCase() || 'standard';
  return normalized in PROFILE_ORDER ? normalized : 'standard';
}

export function parseDisabledHooks(value = '') {
  return new Set(
    String(value || '')
      .split(',')
      .map(entry => normalizeHookName(entry))
      .filter(Boolean),
  );
}

export function shouldRunForgeHook(hookName = '', env = process.env) {
  const definition = getForgeHookDefinition(hookName);
  if (!definition) {
    return false;
  }

  const disabledHooks = parseDisabledHooks(env?.FORGE_DISABLED_HOOKS);
  if (disabledHooks.has(normalizeHookName(hookName))) {
    return false;
  }

  const activeProfile = normalizeHookProfile(env?.FORGE_HOOK_PROFILE);
  return isHookProfileEnabled(activeProfile, definition.profile);
}

export function isHookProfileEnabled(activeProfile = 'standard', requiredProfile = 'standard') {
  const normalizedActiveProfile = normalizeHookProfile(activeProfile);
  const normalizedRequiredProfile = normalizeHookProfile(requiredProfile);
  return PROFILE_ORDER[normalizedActiveProfile] >= PROFILE_ORDER[normalizedRequiredProfile];
}

export function buildForgeHookProfileSummary() {
  const hooks = Object.entries(HOOK_DEFINITIONS).map(([name, definition]) => ({
    name,
    eventName: definition.eventName,
    profile: definition.profile,
  }));

  const counts = hooks.reduce((acc, hook) => {
    acc.total += 1;
    acc.byProfile[hook.profile] = (acc.byProfile[hook.profile] || 0) + 1;
    return acc;
  }, {
    total: 0,
    byProfile: {
      minimal: 0,
      standard: 0,
      strict: 0,
    },
  });

  return {
    hooks,
    counts,
  };
}
