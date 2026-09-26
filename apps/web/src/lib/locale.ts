import { DEFAULT_LOCALE, isLocale, type Locale } from '@bozukkart/shared';

const STORAGE_KEY = 'bozukkart:locale';

/** Never call during render: it would differ between server and client. */
export function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore.
  }
}

/**
 * The best locale an `Accept-Language` header asks for, falling back to the
 * app default. The server-side twin of `detectLocale`, for metadata that is
 * rendered before any client code has run.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (header === null) {
    return DEFAULT_LOCALE;
  }

  const ranked = header
    .split(',')
    .map((entry, index) => {
      const [tag = '', ...params] = entry.trim().split(';');
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      const weight = quality === undefined ? 1 : Number(quality.slice(2));

      return {
        base: tag.split('-')[0]?.toLowerCase(),
        weight: Number.isNaN(weight) ? 0 : weight,
        index,
      };
    })
    .filter((entry) => entry.weight > 0)
    // Highest weight first; ties keep the order the browser listed them in.
    .sort((left, right) => right.weight - left.weight || left.index - right.index);

  for (const { base } of ranked) {
    if (isLocale(base)) {
      return base;
    }
  }

  return DEFAULT_LOCALE;
}

/** What the browser asks for, falling back to the app default. */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LOCALE;
  }

  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.split('-')[0]?.toLowerCase();
    if (isLocale(base)) {
      return base;
    }
  }

  return DEFAULT_LOCALE;
}
