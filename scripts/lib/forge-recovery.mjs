import { normalizeRecoveryState } from './forge-io.mjs';

export const DEFAULT_RECOVERY_MAX_RETRIES = 3;

export function buildRecoveryId({
  category = '',
  laneId = '',
  command = '',
  phaseId = '',
} = {}) {
  return [category || 'unknown', laneId || '-', command || '-', phaseId || '-'].join(':');
}

export function updateRecoveryLedger(currentRecovery = {}, entry = {}, { maxRetries = DEFAULT_RECOVERY_MAX_RETRIES } = {}) {
  const normalized = normalizeRecoveryState(currentRecovery);
  const id = entry.id || buildRecoveryId({
    category: entry.category,
    laneId: entry.lane_id,
    command: entry.command,
    phaseId: entry.phase_id,
  });
  const existing = normalized.active.find(item => item.id === id) || null;
  const retryCount = existing ? (existing.retry_count + 1) : (entry.retry_count || 1);
  const escalated = retryCount >= maxRetries;

  const nextItem = {
    id,
    at: entry.at || new Date().toISOString(),
    category: entry.category || '',
    lane_id: entry.lane_id || '',
    phase_id: entry.phase_id || '',
    command: entry.command || '',
    guidance: entry.guidance || '',
    suggested_command: entry.suggested_command || '',
    retry_count: retryCount,
    max_retry_count: maxRetries,
    status: escalated ? 'escalated' : (entry.status || 'active'),
    summary: entry.summary || '',
    escalation_reason: escalated ? `Retry limit reached (${retryCount}/${maxRetries})` : '',
  };

  return normalizeRecoveryState({
    latest: nextItem,
    active: [
      nextItem,
      ...normalized.active.filter(item => item.id !== id),
    ],
  });
}

export function resolveRecoveryItem(currentRecovery = {}, id = '') {
  if (!id) return normalizeRecoveryState(currentRecovery);
  const normalized = normalizeRecoveryState(currentRecovery);
  return normalizeRecoveryState({
    latest: normalized.latest?.id === id
      ? { ...normalized.latest, status: 'resolved' }
      : normalized.latest,
    active: normalized.active.filter(item => item.id !== id),
  });
}

export function renderRecoverySummary(item = null) {
  if (!item) {
    return '';
  }

  const base = `${item.category || 'unknown'} recovery ${item.status || 'active'} (${item.retry_count || 0}/${item.max_retry_count || 0})`;
  return item.escalation_reason ? `${base} — ${item.escalation_reason}` : base;
}
