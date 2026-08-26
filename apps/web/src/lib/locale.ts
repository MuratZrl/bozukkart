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
