import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PunchlineProvider } from '@/components/punchline-provider';

import './globals.css';

export const metadata: Metadata = {
  title: 'Punchline',
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
        <PunchlineProvider>{children}</PunchlineProvider>
      </body>
    </html>
  );
}
