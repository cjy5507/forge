// Forge i18n Pattern Registry — all locale-specific regex patterns in one place.
// Supported locales: en (English), ko (Korean), ja (Japanese), zh (Chinese Simplified + Traditional)
// Zero dependencies. Pure regex. Each export is a locale-keyed object.

// ── Forge Name Triggers (explicit "forge" invocation) ──

export const FORGE_TRIGGERS = {
  en: [/\bforge\b/i, /\/forge\b/i, /\bforge:/i],
  ko: [/포지/, /포지:/, /\/포지/],
  ja: [/フォージ/, /\/フォージ/],
  zh: [/锻造|鍛造/, /\/锻造|\/鍛造/],
};

// ── Build Triggers ("make me something") ──

export const BUILD_TRIGGERS = {
  en: [/build\s+(me\s+)?a\b/i, /create\s+(me\s+)?a\b/i, /make\s+(me\s+)?a\b/i, /develop\s+(me\s+)?a\b/i],
  ko: [/만들어\s*줘/i, /구축해\s*줘/i, /개발해\s*줘/i, /빌드해\s*줘/i],
  ja: [/作って/i, /構築して/i, /開発して/i, /ビルドして/i],
  zh: [/做一个|做一個/i, /构建|構建/i, /开发|開發/i, /创建|創建/i],
};

// ── Repair Triggers ("fix/analyze something") ──

export const REPAIR_TRIGGERS = {
  en: [/fix\s+(this|the|my)\b/i, /debug\s/i, /what'?s\s+wrong/i, /analyze\s/i],
  ko: [/고쳐\s*줘/i, /수정해\s*줘/i, /분석해\s*줘/i, /왜\s*안\s*돼/i, /오류/i],
  ja: [/直して/i, /修正して/i, /分析して/i, /なんで動かない/i, /エラー/i],
  zh: [/修复|修復/i, /修改/i, /分析/i, /为什么不行|為什麼不行/i, /错误|錯誤/i],
};

// ── Express Triggers ("quick/express path") ──

export const EXPRESS_TRIGGERS = {
  en: [/\bforge\s+express\b/i, /\bquick build\b/i, /\bexpress\b/i],
  ko: [/빠르게\s*만들어/i, /익스프레스|express/i, /퀵\s*빌드/i],
  ja: [/クイックビルド/i, /エクスプレス|express/i, /素早く作って/i],
  zh: [/快速构建|快速構建/i, /快速搭建/i, /express|快建/i],
};

// ── Active-project Natural Triggers ("continue/status/analyze without saying forge") ──

export const RESUME_TRIGGERS = {
  en: [/\bcontinue\b/i, /\bresume\b/i, /\bpick up where we left off\b/i, /\bwhere did we leave off\b/i],
  ko: [/이어서\s*해\s*줘/i, /이어가\s*자/i, /계속해\s*줘/i, /어디까지\s*했/i],
  ja: [/続けて/i, /再開して/i, /どこまでやった/i],
  zh: [/继续|繼續/i, /继续做|繼續做/i, /做到哪了|做到哪裡了/i],
};

export const STATUS_TRIGGERS = {
  en: [/\bwhat(?:'s|\s+is)\s+next\b/i, /\bshow (?:me )?(?:the )?(?:status|progress)\b/i, /\bwhere are we\b/i, /\bcurrent status\b/i, /\bprogress update\b/i],
  ko: [/진행\s*상황/i, /상태\s*(?:보여|알려)/i, /현재\s*상태/i, /다음\s*뭐/i],
  ja: [/進捗/i, /状態を見せて/i, /今の状態/i, /次は何/i],
  zh: [/进度|進度/i, /状态|狀態/i, /现在什么情况|現在什麼情況/i, /下一步/i],
};

export const ANALYZE_PROJECT_TRIGGERS = {
  en: [/\banaly[sz]e\s+(?:this|the|my)?\s*(?:repo|repository|codebase|project)\b/i, /\bimpact analysis\b/i, /\bcodebase analysis\b/i],
  ko: [/코드베이스\s*분석/i, /영향\s*분석/i, /프로젝트\s*분석/i],
  ja: [/コードベース分析/i, /影響分析/i, /プロジェクト分析/i],
  zh: [/代码库分析|程式碼庫分析/i, /影响分析|影響分析/i, /项目分析|專案分析/i],
};

export const DESIGN_IMPROVEMENT_TRIGGERS = {
  en: [/\bimprove\s+(?:the\s+)?(?:design|ux|ui)\b/i, /\bredesign\b/i, /\busability improvement\b/i, /\bimprove\s+(?:the\s+)?flow\b/i],
  ko: [/디자인\s*개선/i, /ux\s*개선/i, /ui\s*개선/i, /리디자인/i, /사용성\s*개선/i, /흐름\s*개선/i],
  ja: [/デザイン改善/i, /ux改善/i, /ui改善/i, /リデザイン/i, /使いやすさ改善/i, /フロー改善/i],
  zh: [/设计改进|設計改進/i, /ux改进|ux改善|ux改進/i, /ui改进|ui改進/i, /重设计|重設計/i, /可用性改进|可用性改進/i, /流程改进|流程改進/i],
};

export const NATURAL_PROJECT_SKILL_TRIGGERS = {
  analyze: {
    en: [/\banaly[sz]e\s+(?:this|it)\b/i, /\broot cause\b/i, /\binvestigate\b/i],
    ko: [/분석해\s*줘/i, /원인\s*찾아/i, /조사해\s*줘/i],
    ja: [/分析して/i, /原因を調べて/i, /調査して/i],
    zh: [/分析一下|分析这/i, /查找原因/i, /调查一下|調查一下/i],
  },
  design: {
    en: [/\bdesign\s+(?:this|it)\b/i, /\barchitecture design\b/i, /\bui spec\b/i],
    ko: [/설계해\s*줘/i, /디자인해\s*줘/i, /아키텍처\s*설계/i],
    ja: [/設計して/i, /デザインして/i, /アーキテクチャ設計/i],
    zh: [/设计这个|設計這個/i, /架构设计|架構設計/i, /界面规范|介面規範/i],
  },
  develop: {
    en: [/\bimplement\s+(?:this|it)\b/i, /\bbuild\s+(?:this|it)\s+now\b/i],
    ko: [/구현해\s*줘/i, /지금\s*구현/i],
    ja: [/実装して/i, /今すぐ実装/i],
    zh: [/实现这个|實現這個/i, /现在实现|現在實現/i],
  },
  fix: {
    en: [/\bfix\s+(?:this|it|the bug)\b/i, /\bbug fix\b/i],
    ko: [/이거\s*고쳐/i, /버그\s*수정/i],
    ja: [/これを直して/i, /バグ修正/i],
    zh: [/修复这个|修復這個/i, /修 bug|bug修复|bug修復/i],
  },
  qa: {
    en: [/\brun\s+qa\b/i, /\bqa\s+this\b/i, /\btest\s+this\b/i],
    ko: [/qa\s*돌려/i, /테스트해\s*줘/i, /검증해\s*줘/i],
    ja: [/qaして/i, /テストして/i, /検証して/i],
    zh: [/跑\s*qa/i, /测试这个|測試這個/i, /验证一下|驗證一下/i],
  },
  security: {
    en: [/\bsecurity\s+review\b/i, /\bsecurity\s+check\b/i],
    ko: [/보안\s*검토/i, /보안\s*체크/i],
    ja: [/セキュリティレビュー/i, /セキュリティチェック/i],
    zh: [/安全审查|安全審查/i, /安全检查|安全檢查/i],
  },
  deliver: {
    en: [/\bdeliver\s+this\b/i, /\bprepare\s+delivery\b/i, /\bship\s+this\b/i],
    ko: [/배포해\s*줘/i, /전달\s*준비/i, /출시해\s*줘/i],
    ja: [/納品して/i, /デリバリー準備/i, /出荷して/i],
    zh: [/交付这个|交付這個/i, /准备交付|準備交付/i, /发布这个|發布這個/i],
  },
};

// ── Task Type Patterns (for detectTaskType) ──

export const TASK_TYPE_PATTERNS = {
  bugfix: {
    en: /(\bbug\b|\bfix\b|\bregression\b|\bdiagnos\w*\b|\btroubleshoot\b|\brca\b|\bwhy\b)/,
    ko: /오류|버그|고쳐/,
    ja: /バグ|修正|直して|エラー/,
    zh: /缺陷|修复|修復|错误|錯誤/,
  },
  refactor: {
    en: /(\brefactor\b|\bcleanup\b|\bsimplify\b|\brename\b)/,
    ko: /정리|리팩토링/,
    ja: /リファクタリング|整理/,
    zh: /重构|重構|整理/,
  },
  review: {
    en: /(\breview\b|\bpr review\b|\bcode review\b)/,
    ko: /리뷰|코드리뷰/,
    ja: /レビュー|コードレビュー/,
    zh: /审查|審查|代码审查|代碼審查/,
  },
  question: {
    en: /(\bquestion\b|\bexplain\b|\bwhat(?:'s|\s+is|\s+are|\s+does|\s+do|\s+did)\b)/,
    ko: /어떻게|설명|질문|뭐야|왜/,
    ja: /質問|説明|どうやって|なぜ/,
    zh: /问题|問題|说明|說明|怎么|怎麼|为什么|為什麼/,
  },
  pipeline: {
    en: /(\bfull\b|\ball phases\b|\bpipeline\b|\bentire\b|\bwhole system\b|\bcompany\b|\bworkflow\b|\bphase\b)/,
    ko: /하네스|전체|워크플로우|팀/,
    ja: /ハーネス|全体|ワークフロー|パイプライン/,
    zh: /全部|流水线|流水線|工作流|团队|團隊/,
  },
  feature: {
    en: /(\bfeature\b|\bimplement\b|\badd\b|\bbuild\b|\bcreate\b|\bpage\b|\bscreen\b)/,
    ko: /기능|추가|구현|만들/,
    ja: /機能|追加|実装|作成/,
    zh: /功能|添加|实现|创建|創建/,
  },
  design: {
    en: /(\bdesign\b|\bux\b|\bui\b|\bredesign\b|\busability\b|\bflow\b)/,
    ko: /디자인|\bux\b|\bui\b|리디자인|사용성|흐름/,
    ja: /デザイン|\bux\b|\bui\b|リデザイン|使いやすさ|フロー/,
    zh: /设计|設計|\bux\b|\bui\b|重设计|重設計|可用性|流程/,
  },
};

// ── Full-tier classification patterns (for classifyTierFromMessage) ──

export const FULL_TIER_PATTERNS = {
  en: /\bforge:ignite\b|\bset up forge\b|\bbuild a harness\b|all phases|full pipeline/,
  ko: /전체|하네스/,
  ja: /全体|ハーネス|全フェーズ/,
  zh: /全部|全部阶段|流水线|流水線/,
};

// ── Interactive Message Patterns (for messageLooksInteractive) ──

export const INTERACTIVE_PATTERNS = {
  en: [/\bconfirm\b(?!ed|ing)/, /\bapproval\b/, /\bapprove\b(?!d)/, /\bchoose\b/, /\bwhich option\b/, /\bwaiting for\b/, /\bneed your input\b/, /\bdo you want\b/],
  ko: [/계속할까요/, /확인(?!.*완료)/, /선택/, /어느/, /입력이 필요/],
  ja: [/続けますか/, /確認/, /選択/, /どの/, /入力が必要/],
  zh: [/继续吗|繼續嗎/, /确认|確認/, /选择|選擇/, /哪个|哪個/, /需要输入|需要輸入/],
};

// ── Area Patterns (for task-decomposer AREA_PATTERNS) ──

export const AREA_PATTERNS_I18N = {
  frontend: { ko: /프론트/, ja: /フロント/, zh: /前端/ },
  backend:  { ko: /백엔드|서버/, ja: /バックエンド|サーバー/, zh: /后端|後端|服务器|伺服器/ },
  database: { ko: /디비|데이터베이스/, ja: /データベース/, zh: /数据库|資料庫/ },
  auth:     { ko: /인증|로그인/, ja: /認証|ログイン/, zh: /认证|認證|登录|登錄/ },
  testing:  { ko: /테스트/, ja: /テスト/, zh: /测试|測試/ },
  infra:    { ko: /인프라|배포/, ja: /インフラ|デプロイ/, zh: /基础设施|基礎設施|部署/ },
};

// ── Task Patterns for task-decomposer ──

export const TASK_PATTERNS_I18N = {
  'feature':       { ko: /기능|만들어|추가/, ja: /機能|作って|追加/, zh: /功能|创建|創建|添加/ },
  'refactoring':   { ko: /리팩토링|정리/, ja: /リファクタリング|整理/, zh: /重构|重構|整理/ },
  'bug-fix':       { ko: /안 ?돼|고쳐|오류|에러/, ja: /動かない|直して|エラー/, zh: /不行|修复|修復|错误|錯誤/ },
  'testing':       { ko: /테스트/, ja: /テスト/, zh: /测试|測試/ },
  'documentation': { ko: /문서/, ja: /ドキュメント|文書/, zh: /文档|文檔/ },
  'migration':     { ko: /이전|마이그레이션/, ja: /移行|マイグレーション/, zh: /迁移|遷移/ },
  'optimization':  { ko: /빠르게|최적화/, ja: /高速化|最適化/, zh: /优化|優化|加速/ },
  'fullstack-app': { ko: /풀스택|웹\s*앱|어플리케이션|대시보드/, ja: /フルスタック|ウェブアプリ|ダッシュボード/, zh: /全栈|全棧|网页应用|網頁應用|仪表板|儀表板/ },
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
