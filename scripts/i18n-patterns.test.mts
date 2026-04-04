import { describe, expect, it } from 'vitest';
import {
  allTriggers,
  mergeIntoRegex,
  FORGE_TRIGGERS,
  BUILD_TRIGGERS,
  REPAIR_TRIGGERS,
  TASK_TYPE_PATTERNS,
  INTERACTIVE_PATTERNS,
  AREA_PATTERNS_I18N,
  TASK_PATTERNS_I18N,
  FULL_TIER_PATTERNS,
} from './lib/i18n-patterns.mjs';
import { detectTaskType, classifyTierFromMessage } from './lib/forge-tiers.mjs';
import { messageLooksInteractive } from './lib/forge-session.mjs';
import { analyzeTask } from './lib/task-decomposer.mjs';

describe('allTriggers', () => {
  it('flattens locale-keyed object into flat array', () => {
    const flat = allTriggers(BUILD_TRIGGERS);
    expect(Array.isArray(flat)).toBe(true);
    expect(flat.length).toBe(
      BUILD_TRIGGERS.en.length + BUILD_TRIGGERS.ko.length +
      BUILD_TRIGGERS.ja.length + BUILD_TRIGGERS.zh.length
    );
  });

  it('all entries are RegExp', () => {
    for (const re of allTriggers(FORGE_TRIGGERS)) {
      expect(re).toBeInstanceOf(RegExp);
    }
  });
});

describe('mergeIntoRegex', () => {
  it('produces regex matching all locales', () => {
    const merged = mergeIntoRegex(/\bbug\b/i, { ko: /버그/, ja: /バグ/, zh: /缺陷/ });
    expect(merged.test('found a bug')).toBe(true);
    expect(merged.test('버그 발견')).toBe(true);
    expect(merged.test('バグを見つけた')).toBe(true);
    expect(merged.test('发现缺陷')).toBe(true);
    expect(merged.test('hello world')).toBe(false);
  });
});

describe('detectTaskType i18n', () => {
  // Korean (existing)
  it('Korean: bugfix', () => expect(detectTaskType('오류 고쳐줘')).toBe('bugfix'));
  it('Korean: refactor', () => expect(detectTaskType('코드 정리해줘')).toBe('refactor'));
  it('Korean: feature', () => expect(detectTaskType('새 기능 추가')).toBe('feature'));

  // Japanese
  it('Japanese: bugfix', () => expect(detectTaskType('バグを直して')).toBe('bugfix'));
  it('Japanese: refactor', () => expect(detectTaskType('リファクタリングして')).toBe('refactor'));
  it('Japanese: review', () => expect(detectTaskType('コードレビューお願い')).toBe('review'));
  it('Japanese: question', () => expect(detectTaskType('なぜこうなるのか説明して')).toBe('question'));
  it('Japanese: pipeline', () => expect(detectTaskType('全体パイプライン実行')).toBe('pipeline'));
  it('Japanese: feature', () => expect(detectTaskType('新しい機能を追加して')).toBe('feature'));

  // Chinese
  it('Chinese: bugfix', () => expect(detectTaskType('修复这个错误')).toBe('bugfix'));
  it('Chinese: refactor', () => expect(detectTaskType('重构这个模块')).toBe('refactor'));
  it('Chinese: review', () => expect(detectTaskType('代码审查')).toBe('review'));
  it('Chinese: question', () => expect(detectTaskType('为什么会这样')).toBe('question'));
  it('Chinese: pipeline', () => expect(detectTaskType('运行全部流水线')).toBe('pipeline'));
  it('Chinese: feature', () => expect(detectTaskType('添加新功能')).toBe('feature'));

  // English still works
  it('English: bugfix', () => expect(detectTaskType('fix this bug')).toBe('bugfix'));
  it('English: feature', () => expect(detectTaskType('add a new feature')).toBe('feature'));
});

describe('classifyTierFromMessage i18n', () => {
  it('Japanese: full tier', () => expect(classifyTierFromMessage('全体ハーネス実行')).toBe('full'));
  it('Chinese: full tier', () => expect(classifyTierFromMessage('运行全部阶段')).toBe('full'));
  it('Korean: full tier', () => expect(classifyTierFromMessage('전체 하네스')).toBe('full'));
});

describe('messageLooksInteractive i18n', () => {
  // English
  it('English: confirm', () => expect(messageLooksInteractive('Please confirm your choice')).toBe(true));
  // Korean
  it('Korean: 계속할까요', () => expect(messageLooksInteractive('계속할까요?')).toBe(true));
  // Japanese
  it('Japanese: 続けますか', () => expect(messageLooksInteractive('続けますか？')).toBe(true));
  it('Japanese: 確認', () => expect(messageLooksInteractive('確認してください')).toBe(true));
  // Chinese
  it('Chinese: 继续吗', () => expect(messageLooksInteractive('继续吗？')).toBe(true));
  it('Chinese: 确认', () => expect(messageLooksInteractive('请确认')).toBe(true));
  // Negative
  it('no match', () => expect(messageLooksInteractive('hello world')).toBe(false));
});

describe('analyzeTask i18n (task-decomposer)', () => {
  // Japanese
  it('Japanese: backend + database', () => {
    const result = analyzeTask('バックエンドとデータベースを作って');
    expect(result.areas).toContain('backend');
    expect(result.areas).toContain('database');
  });
  it('Japanese: frontend', () => {
    const result = analyzeTask('フロントエンドのコンポーネントを追加');
    expect(result.areas).toContain('frontend');
  });

  // Chinese
  it('Chinese: backend + database', () => {
    const result = analyzeTask('创建后端服务器和数据库');
    expect(result.areas).toContain('backend');
    expect(result.areas).toContain('database');
  });
  it('Chinese: auth', () => {
    const result = analyzeTask('添加认证和登录功能');
    expect(result.areas).toContain('auth');
  });

  // Korean (existing, verify still works)
  it('Korean: backend + database', () => {
    const result = analyzeTask('API 서버랑 데이터베이스 만들어줘');
    expect(result.areas).toContain('backend');
    expect(result.areas).toContain('database');
  });
});

describe('forge triggers i18n', () => {
  const all = allTriggers(FORGE_TRIGGERS);
  it('English: forge', () => expect(all.some(re => re.test('forge start'))).toBe(true));
  it('Korean: 포지', () => expect(all.some(re => re.test('포지 시작'))).toBe(true));
  it('Japanese: フォージ', () => expect(all.some(re => re.test('フォージ開始'))).toBe(true));
  it('Chinese: 锻造', () => expect(all.some(re => re.test('锻造开始'))).toBe(true));
});

describe('build/repair triggers i18n', () => {
  const buildAll = allTriggers(BUILD_TRIGGERS);
  const repairAll = allTriggers(REPAIR_TRIGGERS);

  it('Japanese: build', () => expect(buildAll.some(re => re.test('ダッシュボードを作って'))).toBe(true));
  it('Chinese: build', () => expect(buildAll.some(re => re.test('做一个仪表板'))).toBe(true));
  it('Japanese: repair', () => expect(repairAll.some(re => re.test('このバグを直して'))).toBe(true));
  it('Chinese: repair', () => expect(repairAll.some(re => re.test('修复这个问题'))).toBe(true));
});
