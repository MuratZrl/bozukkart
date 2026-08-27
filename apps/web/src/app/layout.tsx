import { DEFAULT_LOCALE, translate } from '@bozukkart/shared';
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
export const metadata: Metadata = {
  // Everything below, and every route under it, may use relative URLs.
  metadataBase: SITE_URL,
  title: translate(DEFAULT_LOCALE, 'app.name'),
  description: translate(DEFAULT_LOCALE, 'app.description'),
  openGraph: {
    type: 'website',
    siteName: translate(DEFAULT_LOCALE, 'app.name'),
    locale: ogLocale(DEFAULT_LOCALE),
    url: '/',
    title: translate(DEFAULT_LOCALE, 'app.name'),
    description: translate(DEFAULT_LOCALE, 'app.description'),
  },
  twitter: {
    card: 'summary_large_image',
    title: translate(DEFAULT_LOCALE, 'app.name'),
    description: translate(DEFAULT_LOCALE, 'app.description'),
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
      </body>
    </html>
  );
}
