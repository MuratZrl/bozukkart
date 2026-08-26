import { DEFAULT_LOCALE, translate } from '@bozukkart/shared';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { BozukkartProvider } from '@/components/bozukkart-provider';

import './globals.css';

// Document metadata is rendered on the server, before any client preference is
// known, so it uses the app default rather than inventing a second source of
// truth for the same strings.
export const metadata: Metadata = {
  title: translate(DEFAULT_LOCALE, 'app.name'),
  description: translate(DEFAULT_LOCALE, 'app.description'),
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="min-h-full font-sans text-zinc-100 antialiased">
        <BozukkartProvider>{children}</BozukkartProvider>
      </body>
    </html>
  );
}
