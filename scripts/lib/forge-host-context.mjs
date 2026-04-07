import {
  normalizeHostContext,
  normalizeHostId,
  requireString,
} from './forge-io.mjs';
import { getForgeHostSupportProfile } from './forge-host-support.mjs';

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
