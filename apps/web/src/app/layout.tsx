import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PunclineProvider } from '@/components/puncline-provider';

import './globals.css';

export const metadata: Metadata = {
  title: 'Puncline',
  description: 'A fill-in-the-blank party game for people with poor judgement.',
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full font-sans text-zinc-100 antialiased">
        <PunclineProvider>{children}</PunclineProvider>
      </body>
    </html>
  );
}
