import { DEFAULT_LOCALE, roomCodeSchema, translate } from '@bozukkart/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LobbyScreen } from '@/components/lobby-screen';
import { ogLocale } from '@/lib/site';

interface RoomPageProps {
  readonly params: Promise<{ code: string }>;
}

/**
 * A room link is pasted into a group chat far more often than it is typed, so
 * the unfurl has to read as an invitation with the code in it, not as the
 * landing page a second time. The image comes from `opengraph-image` beside
 * this file; only the prose is set here.
 */
export async function generateMetadata({
  params,
}: RoomPageProps): Promise<Metadata> {
  const { code } = await params;
  const parsed = roomCodeSchema.safeParse(code);

  if (!parsed.success) {
    return {
      title: translate(DEFAULT_LOCALE, 'app.name'),
    };
  }

  const title = translate(DEFAULT_LOCALE, 'meta.roomOgTitle', {
    code: parsed.data,
  });
  const description = translate(DEFAULT_LOCALE, 'meta.roomOgDescription');

  return {
    // The tab is read by someone already in the room, who wants the code, not
    // the invitation they were sent an hour ago.
    title: translate(DEFAULT_LOCALE, 'meta.roomTitle', { code: parsed.data }),
    description,
    // Next replaces the layout's `openGraph` rather than merging into it, so
    // the site-wide fields are repeated here or they are simply lost.
    openGraph: {
      type: 'website',
      siteName: translate(DEFAULT_LOCALE, 'app.name'),
      locale: ogLocale(DEFAULT_LOCALE),
      url: `/room/${parsed.data}`,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;

  // Same schema the gateway uses, so a junk URL never reaches the socket layer.
  const parsed = roomCodeSchema.safeParse(code);
  if (!parsed.success) {
    notFound();
  }

  return <LobbyScreen code={parsed.data} />;
}
