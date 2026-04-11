import { existsSync } from 'fs';
import { join } from 'path';
import { getForgeAllowedHiddenTopLevelEntries } from './forge-host.mjs';
import { normalizeHostId } from './forge-io.mjs';

const FULL_PROFILE = 'full';
const MINIMAL_PROFILE = 'minimal';
const RUNTIME_PROFILE = 'runtime';
const ALL_HOSTS = 'all';
const INSTALL_STATE_FILE = '.forge-install-state.json';

const SELECTIVE_VISIBLE_ENTRIES = Object.freeze({
  [MINIMAL_PROFILE]: Object.freeze([
    'README.md',
    'agents',
    'commands',
    'hooks',
    'package.json',
    'scripts',
    'skills',
    'templates',
    'tsconfig.json',
    'types',
    'vitest.config.ts',
  ]),
  [RUNTIME_PROFILE]: Object.freeze([
    'README.md',
    'agents',
    'assets',
    'commands',
    'docs',
    'hooks',
    'package-lock.json',
    'package.json',
    'scripts',
    'skills',
    'templates',
    'tsconfig.json',
    'types',
    'vitest.config.ts',
  ]),
});

const HOST_VISIBLE_ENTRIES = Object.freeze({
  claude: Object.freeze(['CLAUDE.md']),
  codex: Object.freeze([]),
  gemini: Object.freeze(['GEMINI.md', 'gemini-extension.json']),
  qwen: Object.freeze(['QWEN.md', 'qwen-extension.json', 'qwen-commands']),
});

const HOST_HIDDEN_ENTRIES = Object.freeze({
  claude: Object.freeze(['.claude-plugin']),
  codex: Object.freeze(['.codex-plugin']),
  gemini: Object.freeze([]),
  qwen: Object.freeze([]),
});

const SHARED_HIDDEN_ENTRIES = Object.freeze(['.mcp.json']);
const SELECTIVE_PROFILES = Object.freeze([MINIMAL_PROFILE, RUNTIME_PROFILE]);
const ALL_SETUP_PROFILES = Object.freeze([FULL_PROFILE, ...SELECTIVE_PROFILES]);
const ALL_SETUP_HOSTS = Object.freeze([ALL_HOSTS, 'claude', 'codex', 'gemini', 'qwen']);

function dedupe(items = []) {
  return [...new Set(items)];
}

export function getForgeSetupProfiles() {
  return [...ALL_SETUP_PROFILES];
}

export function getForgeSetupHosts() {
  return [...ALL_SETUP_HOSTS];
}

export function normalizeSetupProfile(value = '') {
  const profile = String(value || FULL_PROFILE).trim().toLowerCase() || FULL_PROFILE;
  if (!ALL_SETUP_PROFILES.includes(profile)) {
    throw new Error(`Unknown setup profile: ${value}`);
  }
  return profile;
}

export function normalizeSetupHost(value = '') {
  const raw = String(value || ALL_HOSTS).trim().toLowerCase() || ALL_HOSTS;
  if (raw === ALL_HOSTS) {
    return ALL_HOSTS;
  }

  const normalized = normalizeHostId(raw, '');
  if (!normalized || !ALL_SETUP_HOSTS.includes(normalized)) {
    throw new Error(`Unknown setup host: ${value}`);
  }
  return normalized;
}

export function isSelectiveSetup({ profile = FULL_PROFILE, host = ALL_HOSTS } = {}) {
  return normalizeSetupProfile(profile) !== FULL_PROFILE || normalizeSetupHost(host) !== ALL_HOSTS;
}

export function resolveSetupSelection({ profile = FULL_PROFILE, host = ALL_HOSTS } = {}) {
  const normalizedProfile = normalizeSetupProfile(profile);
  const normalizedHost = normalizeSetupHost(host);

  if (normalizedProfile === FULL_PROFILE && normalizedHost === ALL_HOSTS) {
    return {
      profile: normalizedProfile,
      host: normalizedHost,
      selective: false,
      visibleEntries: [],
      hiddenEntries: [],
    };
  }

  const visibleEntries = [...(SELECTIVE_VISIBLE_ENTRIES[normalizedProfile] || SELECTIVE_VISIBLE_ENTRIES[RUNTIME_PROFILE])];
  const hiddenEntries = [...SHARED_HIDDEN_ENTRIES];
  const targetHosts = normalizedHost === ALL_HOSTS ? ['claude', 'codex', 'gemini', 'qwen'] : [normalizedHost];

  for (const targetHost of targetHosts) {
    visibleEntries.push(...(HOST_VISIBLE_ENTRIES[targetHost] || []));
    hiddenEntries.push(...(HOST_HIDDEN_ENTRIES[targetHost] || []));
  }

  return {
    profile: normalizedProfile,
    host: normalizedHost,
    selective: true,
    visibleEntries: dedupe(visibleEntries),
    hiddenEntries: dedupe(hiddenEntries),
  };
}

export function validateSetupSelection(rootDir, selection) {
  const missingEntries = [];
  for (const entry of [...selection.visibleEntries, ...selection.hiddenEntries]) {
    if (!existsSync(join(rootDir, entry))) {
      missingEntries.push(entry);
    }
  }

  return {
    valid: missingEntries.length === 0,
    missingEntries,
  };
}

export function describeSetupSelection(selection) {
  const allowedHidden = new Set(getForgeAllowedHiddenTopLevelEntries());
  const hiddenEntries = selection.hiddenEntries.filter(entry => entry.startsWith('.') && allowedHidden.has(entry));
  return {
    profile: selection.profile,
    host: selection.host,
    selective: selection.selective,
    visibleEntries: [...selection.visibleEntries],
    hiddenEntries,
  };
}

export function getForgeInstallStateFileName() {
  return INSTALL_STATE_FILE;
}
