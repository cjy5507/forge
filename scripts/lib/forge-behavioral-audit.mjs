import { summarizeLaneCounts } from './forge-lanes.mjs';
import { resolvePhase } from './forge-phases.mjs';
import { localizeText, normalizeLocale } from './forge-i18n.mjs';

const DEFAULT_COUNTERS = {
  total_prompts: 0,
  question_prompts: 0,
  design_improvement_requests: 0,
};

const PROFILE_LABELS = {
  '': { ko: '', en: '', ja: '', zh: '' },
  'question-heavy': {
    ko: '질문 과다형',
    en: 'question-heavy',
    ja: '質問過多',
    zh: '提问过多',
  },
  'serial-finisher': {
    ko: '직렬 처리형',
    en: 'serial-finisher',
    ja: '逐次処理型',
    zh: '串行执行型',
  },
  'premature-handoff': {
    ko: '조기 핸드오프형',
    en: 'premature-handoff',
    ja: '早期ハンドオフ型',
    zh: '过早交接型',
  },
};

const PRESCRIPTION_TEXT = {
  limit_user_questions_to_ambiguity_gates: {
    ko: '사용자 질문은 intake/analyze/troubleshoot의 진짜 모호성에만 허용',
    en: 'Only ask the user at approved ambiguity gates in intake/analyze/troubleshoot',
    ja: 'ユーザー質問は intake/analyze/troubleshoot の本当の曖昧さに限定',
    zh: '仅在 intake/analyze/troubleshoot 的真实歧义门触发用户提问',
  },
  resolve_internally_before_asking: {
    ko: '질문 전에 내부 해결, 분석, 사실 확인을 먼저 수행',
    en: 'Resolve internally, analyze, or fact-check before asking',
    ja: '質問前に内部解決・分析・事実確認を優先',
    zh: '提问前先进行内部解决、分析或事实核查',
  },
  finish_scope_without_status_narration: {
    ko: '상태 설명보다 현재 범위 완료를 우선',
    en: 'Prioritize finishing the current scope over narrating status',
    ja: '進捗説明より現在スコープの完了を優先',
    zh: '优先完成当前范围，而不是叙述进度',
  },
  split_parallelizable_scope_into_multiple_lanes: {
    ko: '병렬 가능한 작업은 여러 lane으로 분리',
    en: 'Split parallelizable work into multiple lanes',
    ja: '並列化できる作業は複数レーンに分割',
    zh: '可并行的工作拆成多个 lane',
  },
  dispatch_lead_dev_developer_qa_together: {
    ko: '가능하면 lead-dev, developer, QA를 함께 투입',
    en: 'Dispatch lead-dev, developer, and QA together when scope allows',
    ja: '可能なら lead-dev・developer・QA を同時投入',
    zh: '条件允许时同时投入 lead-dev、developer、QA',
  },
  merge_ready_lanes_before_new_scope: {
    ko: '새 범위보다 merge-ready lane 정리를 먼저',
    en: 'Land merge-ready lanes before opening new scope',
    ja: '新規スコープより merge-ready レーンの着地を優先',
    zh: '开启新范围前先落地 merge-ready lane',
  },
  finish_current_scope_before_checkpoint: {
    ko: 'checkpoint 전에 현재 범위를 먼저 끝낼 것',
    en: 'Finish the current scope before checkpointing',
    ja: 'チェックポイント前に現在スコープを完了',
    zh: 'checkpoint 前先完成当前范围',
  },
  allow_checkpoint_only_for_context_risk: {
    ko: 'checkpoint는 컨텍스트 리스크가 클 때만 허용',
    en: 'Only checkpoint when context risk is high',
    ja: 'チェックポイントはコンテキストリスクが高い時のみ',
    zh: '仅在上下文风险高时允许 checkpoint',
  },
  move_to_qa_when_implementation_complete: {
    ko: '구현이 끝나면 바로 QA로 전환',
    en: 'Move directly to QA when implementation is complete',
    ja: '実装完了後は直ちに QA へ移行',
    zh: '实现完成后直接转到 QA',
  },
};

function normalizeCounters(counters = {}) {
  return {
    ...DEFAULT_COUNTERS,
    ...(counters && typeof counters === 'object' ? counters : {}),
    total_prompts: Number(counters?.total_prompts || 0),
    question_prompts: Number(counters?.question_prompts || 0),
    design_improvement_requests: Number(counters?.design_improvement_requests || 0),
  };
}

export function updateBehavioralCounters(counters = {}, {
  taskType = 'general',
  isDesignImprovement = false,
} = {}) {
  const normalized = normalizeCounters(counters);
  return {
    total_prompts: normalized.total_prompts + 1,
    question_prompts: normalized.question_prompts + (taskType === 'question' ? 1 : 0),
    design_improvement_requests: normalized.design_improvement_requests + (isDesignImprovement ? 1 : 0),
  };
}

export function deriveBehavioralProfile({ state = null, runtime = {} } = {}) {
  const phase = state ? resolvePhase(state) : { id: '' };
  const laneCounts = summarizeLaneCounts(runtime);
  const counters = normalizeCounters(runtime?.behavioral_counters);
  const taskCount = state?.tasks?.length || 0;
  const questionRate = counters.total_prompts > 0
    ? counters.question_prompts / counters.total_prompts
    : 0;
  const hasIncompleteImplementation = ['develop', 'fix'].includes(phase.id)
    && (laneCounts.total > 0 && (laneCounts.done + laneCounts.merged) < laneCounts.total);
  const hasManualContinuation = runtime?.session_brief_mode === 'manual'
    && Boolean(runtime?.session_handoff_summary && runtime?.next_session_owner);

  if (hasIncompleteImplementation && hasManualContinuation) {
    return 'premature-handoff';
  }

  if (counters.question_prompts >= 3 && questionRate >= 0.4) {
    return 'question-heavy';
  }

  if (['develop', 'fix'].includes(phase.id) && taskCount >= 2 && laneCounts.total <= 1) {
    return 'serial-finisher';
  }

  return '';
}

export function prescriptionsForProfile(profile = '') {
  if (profile === 'question-heavy') {
    return [
      'limit_user_questions_to_ambiguity_gates',
      'resolve_internally_before_asking',
      'finish_scope_without_status_narration',
    ];
  }

  if (profile === 'serial-finisher') {
    return [
      'split_parallelizable_scope_into_multiple_lanes',
      'dispatch_lead_dev_developer_qa_together',
      'merge_ready_lanes_before_new_scope',
    ];
  }

  if (profile === 'premature-handoff') {
    return [
      'finish_current_scope_before_checkpoint',
      'allow_checkpoint_only_for_context_risk',
      'move_to_qa_when_implementation_complete',
    ];
  }

  return [];
}

export function renderBehavioralProfile(profile = '', locale = 'en') {
  return localizeText(PROFILE_LABELS[profile] || PROFILE_LABELS[''], locale);
}

export function renderActivePrescriptions(prescriptions = [], locale = 'en') {
  const normalizedLocale = normalizeLocale(locale);
  return prescriptions
    .map(code => ({
      code,
      text: localizeText(PRESCRIPTION_TEXT[code] || {}, normalizedLocale),
    }))
    .filter(entry => entry.text);
}

export function formatBehavioralContext(runtime = {}, locale = 'en') {
  const profile = String(runtime?.behavioral_profile || '').trim();
  const activePrescriptions = Array.isArray(runtime?.active_prescriptions)
    ? runtime.active_prescriptions
    : [];

  if (!profile && activePrescriptions.length === 0) {
    return '';
  }

  const label = renderBehavioralProfile(profile, locale);
  const rendered = renderActivePrescriptions(activePrescriptions, locale);
  const lines = [];

  if (label) {
    const profileText = localizeText({
      ko: `[Forge] 운영 프로필: ${label}`,
      en: `[Forge] Operating profile: ${label}`,
      ja: `[Forge] 運用プロファイル: ${label}`,
      zh: `[Forge] 运行画像: ${label}`,
    }, locale);
    lines.push(profileText);
  }

  if (rendered.length > 0) {
    const header = localizeText({
      ko: '[Forge] 활성 처방:',
      en: '[Forge] Active prescriptions:',
      ja: '[Forge] 有効な処方:',
      zh: '[Forge] 当前处方:',
    }, locale);
    lines.push(header);
    for (const entry of rendered) {
      lines.push(`- ${entry.text}`);
    }
  }

  return lines.join('\n');
}

export function buildBehavioralAuditReport({ state = null, runtime = {} } = {}) {
  const profile = deriveBehavioralProfile({ state, runtime });
  const prescriptions = prescriptionsForProfile(profile);
  const laneCounts = summarizeLaneCounts(runtime);
  const counters = normalizeCounters(runtime?.behavioral_counters);

  return {
    profile,
    prescriptions,
    counters,
    signals: {
      active_phase: state ? resolvePhase(state).id : '',
      lane_total: laneCounts.total,
      lane_incomplete: Math.max(0, laneCounts.total - laneCounts.done - laneCounts.merged),
      question_rate: counters.total_prompts > 0
        ? Number((counters.question_prompts / counters.total_prompts).toFixed(2))
        : 0,
      task_count: state?.tasks?.length || 0,
      session_handoff_present: Boolean(runtime?.session_handoff_summary),
    },
  };
}

export function renderBehavioralAuditReport(report, locale = 'en') {
  const normalizedLocale = normalizeLocale(locale);
  const profileLabel = renderBehavioralProfile(report.profile, normalizedLocale) || 'none';
  const renderedPrescriptions = renderActivePrescriptions(report.prescriptions, normalizedLocale);
  const header = localizeText({
    ko: '# Behavioral Audit',
    en: '# Behavioral Audit',
    ja: '# Behavioral Audit',
    zh: '# Behavioral Audit',
  }, normalizedLocale);
  const profileLine = localizeText({
    ko: `- 프로필: ${profileLabel}`,
    en: `- Profile: ${profileLabel}`,
    ja: `- プロファイル: ${profileLabel}`,
    zh: `- 画像: ${profileLabel}`,
  }, normalizedLocale);
  const promptsLine = localizeText({
    ko: `- 프롬프트: ${report.counters.total_prompts}, 질문 비율: ${report.signals.question_rate}`,
    en: `- Prompts: ${report.counters.total_prompts}, question rate: ${report.signals.question_rate}`,
    ja: `- プロンプト: ${report.counters.total_prompts}, 質問率: ${report.signals.question_rate}`,
    zh: `- 提示次数: ${report.counters.total_prompts}, 提问率: ${report.signals.question_rate}`,
  }, normalizedLocale);
  const lanesLine = localizeText({
    ko: `- 레인: 총 ${report.signals.lane_total}, 미완료 ${report.signals.lane_incomplete}`,
    en: `- Lanes: total ${report.signals.lane_total}, incomplete ${report.signals.lane_incomplete}`,
    ja: `- レーン: 合計 ${report.signals.lane_total}, 未完了 ${report.signals.lane_incomplete}`,
    zh: `- Lane: 总数 ${report.signals.lane_total}, 未完成 ${report.signals.lane_incomplete}`,
  }, normalizedLocale);
  const tasksLine = localizeText({
    ko: `- 작업 수: ${report.signals.task_count}, handoff 존재: ${report.signals.session_handoff_present ? 'yes' : 'no'}`,
    en: `- Task count: ${report.signals.task_count}, handoff present: ${report.signals.session_handoff_present ? 'yes' : 'no'}`,
    ja: `- タスク数: ${report.signals.task_count}, handoff: ${report.signals.session_handoff_present ? 'yes' : 'no'}`,
    zh: `- 任务数: ${report.signals.task_count}, handoff: ${report.signals.session_handoff_present ? 'yes' : 'no'}`,
  }, normalizedLocale);
  const lines = [header, '', profileLine, promptsLine, lanesLine, tasksLine];

  if (renderedPrescriptions.length > 0) {
    lines.push('');
    lines.push(localizeText({
      ko: '## Prescriptions',
      en: '## Prescriptions',
      ja: '## Prescriptions',
      zh: '## Prescriptions',
    }, normalizedLocale));
    for (const item of renderedPrescriptions) {
      lines.push(`- ${item.text}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
