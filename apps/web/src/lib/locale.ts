import { DEFAULT_LOCALE, isLocale, type Locale } from '@bozukkart/shared';

const STORAGE_KEY = 'bozukkart:locale';

/**
 * Every room is created in Turkish for now. The English deck is still the
 * 30/60 placeholder and would run dry within a couple of rounds at a full
 * table, so offering it would be offering a broken game.
 *
 * This is a UI restriction only. The locale still travels on the create
 * payload, the server still validates it against LOCALES, rooms still carry
 * one and the dictionary is still keyed on it. To offer the choice again,
 * restore the picker on the landing page (it calls `setLocale`) and send the
 * chosen locale here instead of this constant.
 */
export const ROOM_CREATION_LOCALE: Locale = 'tr';

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
