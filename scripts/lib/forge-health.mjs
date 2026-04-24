import { existsSync } from 'fs';
import { join } from 'path';
import { detectHostId } from './forge-host.mjs';
import { getForgeHostAdapterContract, getForgeHostSupportProfile } from './forge-host.mjs';
import { getForgeInstallStateFileName } from './forge-setup-manifest.mjs';
import { getVerificationArtifactPath, readVerificationArtifact } from './forge-verification.mjs';
import { readForgeState, readRuntimeState } from './forge-session.mjs';
import { getCompletionBlockers } from './forge-continuation.mjs';
import { getStateTrustWarnings } from './forge-state-trust.mjs';
import { buildForgeHookProfileSummary, isHookProfileEnabled, normalizeHookProfile, parseDisabledHooks } from './forge-hook-controls.mjs';
import { readJsonFile } from './forge-io.mjs';
import { resolvePhase } from './forge-phases.mjs';

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
  audit = false,
  env = process.env,
  state = undefined,
  runtime = undefined,
} = {}) {
  const currentState = state ?? readForgeState(cwd);
  const currentRuntime = runtime ?? readRuntimeState(cwd, { state: currentState });
  const resolvedHostId = resolveHealthHost({ hostId, runtime: currentRuntime, env });
  const profile = getForgeHostSupportProfile(resolvedHostId);
  const adapterContract = getForgeHostAdapterContract(resolvedHostId);
  const manifestChecks = profile.hostId === 'unknown'
    ? []
    : profile.capabilities.degradedModes.map(mode => ({ mode, active: true }));
  const packagePaths = profile.hostId === 'unknown' ? [] : profile.packagePaths || [];
  const missingPackagePaths = packagePaths.filter(relativePath => !existsSync(join(cwd, relativePath)));
  const trustWarnings = getStateTrustWarnings(cwd);
  const analysis = currentRuntime?.analysis || currentState?.analysis || {};
  const verificationStatus = String(currentRuntime?.verification?.status || '').toLowerCase();
  const recoveryStatus = String(currentRuntime?.recovery?.latest?.status || '').toLowerCase();
  const completionBlockers = getCompletionBlockers(currentState || {}, currentRuntime || {});
  const deliveryClaimed = Boolean(currentState) && (
    String(currentState?.status || '').toLowerCase() === 'delivered'
    || String(currentRuntime?.delivery_readiness || '').toLowerCase() === 'delivered'
    || resolvePhase(currentState).id === 'complete'
  );

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

  if (verificationStatus === 'failed') {
    warnings.push(`Verification failed${currentRuntime?.verification?.summary ? `: ${currentRuntime.verification.summary}` : ''}`);
  }

  if (['active', 'escalated'].includes(recoveryStatus)) {
    warnings.push(`Recovery ${recoveryStatus}${currentRuntime?.recovery?.latest?.summary ? `: ${currentRuntime.recovery.latest.summary}` : ''}`);
  }

  if (deliveryClaimed && completionBlockers.length > 0) {
    warnings.push(`Completion blocked: ${completionBlockers.join(', ')}`);
  }

  const report = {
    host: {
      id: profile.hostId,
      name: profile.displayName || 'Unknown',
      support_level: profile.supportLevel,
      degraded_modes: [...profile.capabilities.degradedModes],
      determinism_floor: { ...profile.determinismFloor },
      observed_lifecycle: { ...profile.observedLifecycle },
      missing_package_paths: missingPackagePaths,
    },
    runtime: {
      project: currentState?.project || '',
      phase_id: currentState?.phase_id || currentState?.phase || '',
      active_tier: currentRuntime?.active_tier || currentState?.tier || '',
      analysis_stale: Boolean(analysis?.stale),
      harness_policy: currentRuntime?.harness_policy || currentState?.harness_policy || null,
      latest_decision: currentRuntime?.decision_trace?.latest || null,
      verification_status: currentRuntime?.verification?.status || '',
      recovery_status: currentRuntime?.recovery?.latest?.status || '',
      trust_warnings: trustWarnings,
    },
    warnings,
  };

  if (audit) {
    report.audit = buildHealthAudit({
      cwd,
      env,
      hostId: resolvedHostId,
      packagePaths,
      missingPackagePaths,
    });
  }

  return report;
}

function buildHealthAudit({ cwd = '.', env = process.env, hostId = '', packagePaths = [], missingPackagePaths = [] } = {}) {
  const hookSummary = buildForgeHookProfileSummary();
  const activeProfile = normalizeHookProfile(env?.FORGE_HOOK_PROFILE);
  const disabledHooks = [...parseDisabledHooks(env?.FORGE_DISABLED_HOOKS)];
  const adapterContract = getForgeHostAdapterContract(hostId);
  const installStatePath = join(cwd, getForgeInstallStateFileName());
  const installState = readJsonFile(installStatePath, null);
  const hooksConfigExists = existsSync(join(cwd, 'hooks', 'hooks.json'));
  const runtimeState = readRuntimeState(cwd);
  const tooling = runtimeState?.tooling || {};
  const verificationArtifactPath = getVerificationArtifactPath(cwd);
  const verificationArtifact = readVerificationArtifact(cwd);

  return {
    package_surface: {
      host_id: hostId || 'unknown',
      expected_paths: packagePaths.length,
      missing_paths: [...missingPackagePaths],
      hooks_config_present: hooksConfigExists,
    },
    host_adapter: adapterContract,
    hook_runtime: {
      active_profile: activeProfile,
      disabled_hooks: disabledHooks,
      total_hooks: hookSummary.counts.total,
      hooks_by_profile: { ...hookSummary.counts.byProfile },
      available_hooks: hookSummary.hooks.map(hook => ({
        name: hook.name,
        profile: hook.profile,
        event_name: hook.eventName,
        disabled: disabledHooks.includes(hook.name),
        active: isHookProfileEnabled(activeProfile, hook.profile),
      })),
    },
    install_state: installState
      ? {
        exists: true,
        path: installStatePath,
        profile: installState.profile || 'unknown',
        host: installState.host || 'unknown',
        selective: Boolean(installState.selective),
        mode: installState.mode || 'unknown',
      }
      : {
        exists: false,
        path: installStatePath,
      },
    tooling: {
      package_manager: tooling.package_manager || '',
      package_manager_source: tooling.package_manager_source || '',
      edited_file_count: Array.isArray(tooling.edited_files) ? tooling.edited_files.length : 0,
      last_batch_check_status: tooling.last_batch_check?.status || '',
      last_batch_check_summary: tooling.last_batch_check?.summary || '',
    },
    verification: runtimeState?.verification || null,
    recovery: runtimeState?.recovery || null,
    verification_artifact: {
      exists: Boolean(verificationArtifact),
      path: verificationArtifactPath,
      status: verificationArtifact?.status || '',
      updated_at: verificationArtifact?.updated_at || '',
    },
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
  if (report.host.observed_lifecycle && !report.host.observed_lifecycle.hookLifecycleObserved) {
    lines.push('Observed lifecycle: hooks not observed');
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

  if (report.audit) {
    lines.push(`Audit: hook profile ${report.audit.hook_runtime.active_profile}, ${report.audit.hook_runtime.total_hooks} hooks defined`);
    if (report.audit.install_state.exists) {
      lines.push(`Install state: ${report.audit.install_state.profile}/${report.audit.install_state.host} (${report.audit.install_state.mode})`);
    } else {
      lines.push('Install state: none');
    }
    if (report.audit.tooling.package_manager) {
      lines.push(`Tooling: ${report.audit.tooling.package_manager} (${report.audit.tooling.package_manager_source || 'detected'})`);
    }
    if (report.audit.verification_artifact.exists) {
      lines.push(`Verification artifact: ${report.audit.verification_artifact.status || 'present'}`);
    } else {
      lines.push('Verification artifact: none');
    }
    lines.push(`Determinism floor: continue=${report.audit.host_adapter.determinismFloor.sharedContinue} status=${report.audit.host_adapter.determinismFloor.sharedStatus} analyze=${report.audit.host_adapter.determinismFloor.sharedAnalyze}`);
  }
  if (report.runtime.harness_policy) {
    lines.push(`Policy: ${report.runtime.harness_policy.strictness_mode}/${report.runtime.harness_policy.verification_mode}/${report.runtime.harness_policy.host_posture}`);
  }
  if (report.runtime.latest_decision?.summary) {
    lines.push(`Latest decision: ${report.runtime.latest_decision.summary}`);
  }
  if (report.runtime.verification_status) {
    lines.push(`Verification: ${report.runtime.verification_status}`);
  }
  if (report.runtime.recovery_status) {
    lines.push(`Recovery: ${report.runtime.recovery_status}`);
  }

  return `${lines.join('\n')}\n`;
}
