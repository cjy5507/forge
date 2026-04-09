const LOCALE_CODE_RE = /(?:^|[\s[(])(?:ko|en|ja|zh)(?:$|[\s)\]])/i;

export const SUPPORTED_FORGE_LOCALES = ['ko', 'en', 'ja', 'zh'];

export function normalizeLocale(value, fallback = 'en') {
  const raw = String(value || '').trim().toLowerCase();
  return SUPPORTED_FORGE_LOCALES.includes(raw) ? raw : fallback;
}

export function detectLocale(message = '', fallback = 'en') {
  const text = String(message || '');
  if (!text.trim()) {
    return normalizeLocale(fallback);
  }

  const explicit = text.match(LOCALE_CODE_RE)?.[0]?.trim().toLowerCase();
  if (SUPPORTED_FORGE_LOCALES.includes(explicit)) {
    return explicit;
  }

  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text)) {
    return 'ko';
  }

  if (/[\u3040-\u30ff]/.test(text)) {
    return 'ja';
  }

  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'zh';
  }

  return normalizeLocale(fallback);
}

export function localizeText(dictionary, locale = 'en', fallback = 'en') {
  if (!dictionary || typeof dictionary !== 'object') {
    return '';
  }

  const normalized = normalizeLocale(locale, fallback);
  return String(dictionary[normalized] || dictionary[fallback] || '');
}
