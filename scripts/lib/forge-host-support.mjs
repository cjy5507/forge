import { getForgeHostCatalogEntry } from './forge-host-catalog.mjs';

export function getForgeHostSupportProfile(hostId = '') {
  const profile = getForgeHostCatalogEntry(hostId);
  return {
    hostId: profile.hostId,
    displayName: profile.displayName,
    supportLevel: profile.supportLevel,
    packagePaths: profile.packagePaths,
    capabilities: profile.capabilities,
  };
}

export function getForgeHostCapabilities(hostId = '') {
  return getForgeHostSupportProfile(hostId).capabilities;
}
