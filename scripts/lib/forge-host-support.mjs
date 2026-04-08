import { getForgeHostCatalogEntry } from './forge-host-catalog.mjs';

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
