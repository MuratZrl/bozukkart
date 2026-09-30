import { DEFAULT_LOCALE, translate } from '@bozukkart/shared';
import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';
import { Anton, Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { BozukkartProvider } from '@/components/bozukkart-provider';
import { SITE_URL, ogLocale } from '@/lib/site';

import './globals.css';

/** Display face: the logo, the room code, the prompt. Character over comfort. */
const anton = Anton({
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  variable: '--font-anton',
  display: 'swap',
});

/** Text face: everything anyone actually has to read. Comfort over character. */
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

// Document metadata is rendered on the server, before any client preference is
// known, so it uses the app default rather than inventing a second source of
// truth for the same strings.
//
// The images come from the `opengraph-image` and `twitter-image` files beside
// this one; declaring them here as well would mean two URLs to keep in step.
// They draw the short `app.description` on the card, which is why the longer
// search description below has a key of its own.
const siteTitle = translate(DEFAULT_LOCALE, 'meta.siteTitle');
const siteDescription = translate(DEFAULT_LOCALE, 'meta.siteDescription');

export const metadata: Metadata = {
  // Everything below, and every route under it, may use relative URLs.
  metadataBase: SITE_URL,
  title: {
    // The homepage shares this segment, so it gets `default` untouched; the
    // template only brands titles set by routes below it.
    default: siteTitle,
    template: `%s | ${translate(DEFAULT_LOCALE, 'app.name')}`,
  },
  description: siteDescription,
  // Inherited by every route that does not set its own, so a route that is not
  // the homepage has to override it or it will point search engines here.
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: translate(DEFAULT_LOCALE, 'app.name'),
    locale: ogLocale(DEFAULT_LOCALE),
    url: '/',
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
  },
};

// No `themeColor` here on purpose: a meta tag cannot read a CSS custom property,
// so it would be a second copy of --color-ink free to drift out of step with the
// palette. Add one only if you are willing to keep it in sync by hand.

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${anton.variable} ${inter.variable}`}
    >
      <body className="min-h-full bg-ink font-sans text-bone antialiased">
        <BozukkartProvider>{children}</BozukkartProvider>
        {/*
         * Vercel Web Analytics: page views only, no custom events, and the only
         * tracking in the app. Mounted here rather than per route so it covers
         * every one of them, and it renders nothing, so the `body > *` stacking
         * rule in globals.css has nothing to act on.
         */}
        <Analytics />
      </body>
    </html>
  );
}
