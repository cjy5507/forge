import { existsSync } from 'fs';
import { join } from 'path';
import { detectHostId } from './forge-host-context.mjs';
import { getForgeHostSupportProfile } from './forge-host-support.mjs';
import { readForgeState, readRuntimeState } from './forge-session.mjs';
import { getStateTrustWarnings } from './forge-state-trust.mjs';

function formatDegradedMode(mode = '') {
  return String(mode || '')
    .replace(/_/g, ' ')
    .trim();
}

function resolveHealthHost({ hostId = '', runtime = null, env = process.env } = {}) {
  if (hostId) {
    return hostId;
  }

  const runtimeHost = runtime?.host_context?.current_host || runtime?.host_context?.last_event_host || '';
  return runtimeHost || detectHostId({}, env) || 'unknown';
}

export function buildHealthReport({
  cwd = '.',
  hostId = '',
  env = process.env,
  state = undefined,
  runtime = undefined,
} = {}) {
  const currentState = state ?? readForgeState(cwd);
  const currentRuntime = runtime ?? readRuntimeState(cwd, { state: currentState });
  const resolvedHostId = resolveHealthHost({ hostId, runtime: currentRuntime, env });
  const profile = getForgeHostSupportProfile(resolvedHostId);
  const manifestChecks = profile.hostId === 'unknown'
    ? []
    : profile.capabilities.degradedModes.map(mode => ({ mode, active: true }));
  const packagePaths = profile.hostId === 'unknown' ? [] : profile.packagePaths || [];
  const missingPackagePaths = packagePaths.filter(relativePath => !existsSync(join(cwd, relativePath)));
  const trustWarnings = getStateTrustWarnings(cwd);
  const analysis = currentRuntime?.analysis || currentState?.analysis || {};

  const warnings = [];
  if (profile.supportLevel === 'degraded') {
    warnings.push(`${profile.displayName} runs in degraded mode: ${profile.capabilities.degradedModes.map(formatDegradedMode).join(', ')}`);
  } else if (profile.supportLevel === 'unknown') {
    warnings.push('Current host is unknown to Forge; capability claims are unavailable.');
  }

  if (missingPackagePaths.length > 0) {
    warnings.push(`Missing packaged host surfaces: ${missingPackagePaths.join(', ')}`);
  }

  if (trustWarnings.length > 0) {
    warnings.push(...trustWarnings);
  }

  if (analysis?.artifact_path && analysis?.stale) {
    warnings.push(`Saved analysis is stale: ${analysis.artifact_path}`);
  }

  return {
    host: {
      id: profile.hostId,
      name: profile.displayName || 'Unknown',
      support_level: profile.supportLevel,
      degraded_modes: [...profile.capabilities.degradedModes],
      missing_package_paths: missingPackagePaths,
    },
    runtime: {
      project: currentState?.project || '',
      phase_id: currentState?.phase_id || currentState?.phase || '',
      active_tier: currentRuntime?.active_tier || currentState?.tier || '',
      analysis_stale: Boolean(analysis?.stale),
      trust_warnings: trustWarnings,
    },
    warnings,
  };
}

export function renderHealthText(report) {
  const lines = [
    `Host: ${report.host.name} (${report.host.id})`,
    `Support: ${report.host.support_level}`,
  ];

  if (report.host.degraded_modes.length > 0) {
    lines.push(`Degraded modes: ${report.host.degraded_modes.map(formatDegradedMode).join(', ')}`);
  }
  if (report.host.missing_package_paths.length > 0) {
    lines.push(`Missing package paths: ${report.host.missing_package_paths.join(', ')}`);
  }
  if (report.runtime.project) {
    lines.push(`Project: ${report.runtime.project}`);
  }
  if (report.runtime.phase_id) {
    lines.push(`Phase: ${report.runtime.phase_id}`);
  }
  if (report.runtime.active_tier) {
    lines.push(`Tier: ${report.runtime.active_tier}`);
  }
  if (report.runtime.analysis_stale) {
    lines.push('Analysis: stale');
  }
  if (report.warnings.length > 0) {
    lines.push(`Warnings: ${report.warnings.join(' | ')}`);
  } else {
    lines.push('Warnings: none');
  }

  return `${lines.join('\n')}\n`;
}
