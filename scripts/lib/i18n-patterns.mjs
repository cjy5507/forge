// Forge i18n Pattern Registry — all locale-specific regex patterns in one place.
// Supported locales: en (English), ko (Korean), ja (Japanese), zh (Chinese)
// Zero dependencies. Pure regex. Each export is a locale-keyed object.

// ── Forge Name Triggers (explicit "forge" invocation) ──

export const FORGE_TRIGGERS = {
  en: [/\bforge\b/i, /\/forge\b/i, /\bforge:/i],
  ko: [/포지/, /포지:/, /\/포지/],
  ja: [/フォージ/, /\/フォージ/],
  zh: [/锻造/, /\/锻造/],
};

// ── Build Triggers ("make me something") ──

export const BUILD_TRIGGERS = {
  en: [/build\s+(me\s+)?a\b/i, /create\s+(me\s+)?a\b/i, /make\s+(me\s+)?a\b/i, /develop\s+(me\s+)?a\b/i],
  ko: [/만들어\s*줘/i, /구축해\s*줘/i, /개발해\s*줘/i, /빌드해\s*줘/i],
  ja: [/作って/i, /構築して/i, /開発して/i, /ビルドして/i],
  zh: [/做一个/i, /构建/i, /开发/i, /创建/i],
};

// ── Repair Triggers ("fix/analyze something") ──

export const REPAIR_TRIGGERS = {
  en: [/fix\s+(this|the|my)\b/i, /debug\s/i, /what'?s\s+wrong/i, /analyze\s/i],
  ko: [/고쳐\s*줘/i, /수정해\s*줘/i, /분석해\s*줘/i, /왜\s*안\s*돼/i, /오류/i],
  ja: [/直して/i, /修正して/i, /分析して/i, /なんで動かない/i, /エラー/i],
  zh: [/修复/i, /修改/i, /分析/i, /为什么不行/i, /错误/i],
};

// ── Task Type Patterns (for detectTaskType) ──

export const TASK_TYPE_PATTERNS = {
  bugfix: {
    en: /(\bbug\b|\bfix\b|\bregression\b|\bdiagnos\w*\b|\btroubleshoot\b|\brca\b|\bwhy\b)/,
    ko: /오류|버그|고쳐/,
    ja: /バグ|修正|直して|エラー/,
    zh: /缺陷|修复|错误/,
  },
  refactor: {
    en: /(\brefactor\b|\bcleanup\b|\bsimplify\b|\brename\b)/,
    ko: /정리|리팩토링/,
    ja: /リファクタリング|整理/,
    zh: /重构|整理/,
  },
  review: {
    en: /(\breview\b|\bpr review\b|\bcode review\b)/,
    ko: /리뷰|코드리뷰/,
    ja: /レビュー|コードレビュー/,
    zh: /审查|代码审查/,
  },
  question: {
    en: /(\bquestion\b|\bexplain\b|\bwhat\b)/,
    ko: /어떻게|설명|질문|뭐야|왜/,
    ja: /質問|説明|どうやって|なぜ/,
    zh: /问题|说明|怎么|为什么/,
  },
  pipeline: {
    en: /(\bfull\b|\ball phases\b|\bpipeline\b|\bentire\b|\bwhole system\b|\bcompany\b|\bworkflow\b|\bphase\b)/,
    ko: /하네스|전체|워크플로우|팀/,
    ja: /ハーネス|全体|ワークフロー|パイプライン/,
    zh: /全部|流水线|工作流|团队/,
  },
  feature: {
    en: /(\bfeature\b|\bimplement\b|\badd\b|\bbuild\b|\bcreate\b|\bpage\b|\bscreen\b)/,
    ko: /기능|추가|구현|만들/,
    ja: /機能|追加|実装|作成/,
    zh: /功能|添加|实现|创建/,
  },
};

// ── Full-tier classification patterns (for classifyTierFromMessage) ──

export const FULL_TIER_PATTERNS = {
  en: /\bforge:ignite\b|\bset up forge\b|\bbuild a harness\b|all phases|full pipeline/,
  ko: /전체|하네스/,
  ja: /全体|ハーネス|全フェーズ/,
  zh: /全部|全部阶段|流水线/,
};

// ── Interactive Message Patterns (for messageLooksInteractive) ──

export const INTERACTIVE_PATTERNS = {
  en: [/\bconfirm\b(?!ed|ing)/, /\bapproval\b/, /\bapprove\b(?!d)/, /\bchoose\b/, /\bwhich option\b/, /\bwaiting for\b/, /\bneed your input\b/, /\bdo you want\b/],
  ko: [/계속할까요/, /확인(?!.*완료)/, /선택/, /어느/, /입력이 필요/],
  ja: [/続けますか/, /確認/, /選択/, /どの/, /入力が必要/],
  zh: [/继续吗/, /确认/, /选择/, /哪个/, /需要输入/],
};

// ── Area Patterns (for task-decomposer AREA_PATTERNS) ──

export const AREA_PATTERNS_I18N = {
  frontend: { ko: /프론트/, ja: /フロント/, zh: /前端/ },
  backend:  { ko: /백엔드|서버/, ja: /バックエンド|サーバー/, zh: /后端|服务器/ },
  database: { ko: /디비|데이터베이스/, ja: /データベース/, zh: /数据库/ },
  auth:     { ko: /인증|로그인/, ja: /認証|ログイン/, zh: /认证|登录/ },
  testing:  { ko: /테스트/, ja: /テスト/, zh: /测试/ },
  infra:    { ko: /인프라|배포/, ja: /インフラ|デプロイ/, zh: /基础设施|部署/ },
};

// ── Task Patterns for task-decomposer ──

export const TASK_PATTERNS_I18N = {
  'feature':       { ko: /기능|만들어|추가/, ja: /機能|作って|追加/, zh: /功能|创建|添加/ },
  'refactoring':   { ko: /리팩토링|정리/, ja: /リファクタリング|整理/, zh: /重构|整理/ },
  'bug-fix':       { ko: /안 ?돼|고쳐|오류|에러/, ja: /動かない|直して|エラー/, zh: /不行|修复|错误/ },
  'testing':       { ko: /테스트/, ja: /テスト/, zh: /测试/ },
  'documentation': { ko: /문서/, ja: /ドキュメント|文書/, zh: /文档/ },
  'migration':     { ko: /이전|마이그레이션/, ja: /移行|マイグレーション/, zh: /迁移/ },
  'optimization':  { ko: /빠르게|최적화/, ja: /高速化|最適化/, zh: /优化|加速/ },
};

// ── Helpers ──

/** Flatten a locale-keyed trigger object into a single array for .some(re => re.test()) matching */
export function allTriggers(triggerMap) {
  return Object.values(triggerMap).flat();
}

/** Merge i18n alternatives into an existing English regex for a single combined regex */
export function mergeIntoRegex(englishRegex, i18nMap) {
  const i18nAlts = Object.values(i18nMap).map(r => r.source).join('|');
  const combined = `${englishRegex.source}|${i18nAlts}`;
  return new RegExp(combined, englishRegex.flags);
}

/** Detect locale from message text using Unicode character ranges.
 *  Checks Japanese-specific scripts (Hiragana/Katakana) first to distinguish from Chinese. */
export function detectLocale(text) {
  if (!text) return 'en';
  // Japanese: Hiragana (3040-309F) or Katakana (30A0-30FF) present
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
  // Korean: Hangul syllables (AC00-D7AF) or Jamo (1100-11FF)
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return 'ko';
  // Chinese: CJK Unified Ideographs without Japanese kana
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  return 'en';
}
