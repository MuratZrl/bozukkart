import type { Locale } from '@bozukkart/shared';

/**
 * Where this deployment lives. Metadata needs absolute URLs and is rendered on
 * the server, where there is no `location` to ask.
 */
const FALLBACK_SITE_URL = 'https://bozukkart.com';

function parseSiteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configured === undefined || configured === '') {
    return new URL(FALLBACK_SITE_URL);
  }

  try {
    return new URL(configured);
  } catch {
    // A typo in an env var must not take the build down, and `metadataBase`
    // needs something absolute either way.
    console.warn(
      `NEXT_PUBLIC_SITE_URL is not a URL (${configured}); falling back to ${FALLBACK_SITE_URL}.`,
    );
    return new URL(FALLBACK_SITE_URL);
  }
}

export const SITE_URL = parseSiteUrl();

/** Open Graph wants a full locale tag, not the two letters the app runs on. */
const OG_LOCALES: Record<Locale, string> = {
  tr: 'tr_TR',
  en: 'en_US',
};

export function ogLocale(locale: Locale): string {
  return OG_LOCALES[locale];
}

/**
 * The link that drops someone straight into a room.
 *
 * In the browser this is built from the origin the sharer is actually on, so a
 * link copied from a preview deployment or from a laptop on the local network
 * is joinable by whoever receives it. Only the server, which has no origin to
 * read, falls back to the configured site URL.
 */
export function roomInviteUrl(code: string): string {
  const origin =
    typeof window === 'undefined' ? SITE_URL.origin : window.location.origin;

  return `${origin}/room/${code}`;
}
