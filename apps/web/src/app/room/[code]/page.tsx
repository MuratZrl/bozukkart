import { roomCodeSchema } from '@bozukkart/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LobbyScreen } from '@/components/lobby-screen';

interface RoomPageProps {
  readonly params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: RoomPageProps): Promise<Metadata> {
  const { code } = await params;
  const parsed = roomCodeSchema.safeParse(code);

  return { title: parsed.success ? `Room ${parsed.data} - Bozukkart` : 'Bozukkart' };
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
