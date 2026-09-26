import { DEFAULT_LOCALE, roomCodeSchema, translate } from '@bozukkart/shared';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { LobbyScreen } from '@/components/lobby-screen';
import { localeFromAcceptLanguage } from '@/lib/locale';
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

  // The tab is read by the person sitting at the table, in their own language,
  // like the rest of the UI. The preview below stays in the default: it is
  // drawn for whoever a link is pasted to, and its image is too.
  const readerLocale = localeFromAcceptLanguage(
    (await headers()).get('accept-language'),
  );

  return {
    // The tab is read by someone already in the room, who wants the code, not
    // the invitation they were sent an hour ago.
    title: translate(readerLocale, 'meta.roomTitle', { code: parsed.data }),
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
