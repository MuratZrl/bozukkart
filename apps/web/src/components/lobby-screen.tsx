'use client';

import {
  MAX_PLAYERS_PER_ROOM,
  NICKNAME_MAX_LENGTH,
  describeZodError,
  nicknameSchema,
  type PlayerSnapshot,
} from '@puncline/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ConnectionBadge } from '@/components/connection-badge';
import { usePuncline } from '@/components/puncline-provider';
import { readStoredNickname, storeNickname } from '@/lib/nickname-storage';

export function LobbyScreen({ code }: { readonly code: string }) {
  const router = useRouter();
  const { connected, room, playerId, joinRoom, leaveRoom } = usePuncline();

  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNickname(readStoredNickname());
  }, []);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = setTimeout(() => {
      setCopied(false);
    }, 1_500);

    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  async function handleJoin(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setError(describeZodError(parsed.error, 'Pick a different nickname.'));
      return;
    }

    setBusy(true);
    storeNickname(parsed.data);

    const result = await joinRoom(code, parsed.data);
    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
    }
  }

  async function handleLeave(): Promise<void> {
    setBusy(true);
    await leaveRoom();
    setBusy(false);
    router.push('/');
  }

  async function handleLeaveOther(): Promise<void> {
    setBusy(true);
    setError(null);
    await leaveRoom();
    setBusy(false);
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError('Could not copy. Read the code out loud instead.');
    }
  }

  // In a room, but not this one: happens if someone edits the URL by hand.
  if (room !== null && room.code !== code) {
    return (
      <Shell>
        <div className="rounded-2xl border border-edge bg-surface p-6 text-center">
          <p className="text-sm text-zinc-300">
            You are already in room{' '}
            <span className="font-mono font-bold text-violet-300">
              {room.code}
            </span>
            . Leave it before joining {code}.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/room/${room.code}`)}
              className="flex-1 rounded-xl border border-edge bg-surface-raised px-4 py-3 text-sm font-semibold transition hover:border-violet-500"
            >
              Back to {room.code}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLeaveOther()}
              className="flex-1 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
            >
              Leave {room.code}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // Not in the room yet: someone opened a shared link, or the socket reconnected
  // with a new id and the server no longer knows this player.
  if (room === null) {
    return (
      <Shell>
        <form
          onSubmit={handleJoin}
          className="rounded-2xl border border-edge bg-surface p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Joining room
          </p>
          <p className="code-display mt-1 text-4xl font-black text-violet-300">
            {code}
          </p>

          <label
            className="mt-6 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
            htmlFor="nickname"
          >
            Your nickname
          </label>
          <input
            id="nickname"
            name="nickname"
            autoComplete="nickname"
            autoFocus
            maxLength={NICKNAME_MAX_LENGTH}
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value);
            }}
            placeholder="Dave"
            className="mt-2 w-full rounded-xl border border-edge bg-surface-raised px-4 py-3 text-base outline-none placeholder:text-zinc-600 focus:border-violet-500"
          />

          <button
            type="submit"
            disabled={busy || !connected}
            className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Joining...' : 'Join room'}
          </button>

          {error !== null ? (
            <p role="alert" className="mt-4 text-sm text-rose-400">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-4 w-full text-center text-xs text-zinc-500 underline-offset-4 hover:underline"
          >
            Back to the start
          </button>
        </form>
      </Shell>
    );
  }

  const isHost = room.hostId === playerId;

  return (
    <Shell>
      <section className="rounded-2xl border border-edge bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Room code
            </p>
            <p className="code-display mt-1 text-5xl font-black text-violet-300">
              {room.code}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="shrink-0 rounded-xl border border-edge bg-surface-raised px-3 py-2 text-xs font-semibold transition hover:border-violet-500"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          Share the code. Anyone with it can walk straight in.
        </p>
      </section>

      <section className="rounded-2xl border border-edge bg-surface p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Players
          </h2>
          <span className="text-xs text-zinc-500">
            {room.players.length} / {MAX_PLAYERS_PER_ROOM}
          </span>
        </div>

        <ul className="mt-4 space-y-2">
          {room.players.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              isSelf={player.id === playerId}
            />
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-dashed border-edge p-6 text-center">
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-xl bg-surface-raised px-4 py-3 text-base font-semibold text-zinc-500"
        >
          Start game
        </button>
        <p className="mt-3 text-xs text-zinc-600">
          {isHost
            ? 'You are the host. There is no game to start yet.'
            : 'Waiting on the host. There is no game to start yet.'}
        </p>
      </section>

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleLeave()}
        className="text-center text-sm text-zinc-500 underline-offset-4 transition hover:text-rose-400 hover:underline disabled:opacity-40"
      >
        Leave room
      </button>

      {error !== null ? (
        <p role="alert" className="text-center text-sm text-rose-400">
          {error}
        </p>
      ) : null}
    </Shell>
  );
}

function PlayerRow({
  player,
  isSelf,
}: {
  readonly player: PlayerSnapshot;
  readonly isSelf: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-edge bg-surface-raised px-4 py-3">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-sm font-bold text-violet-300"
      >
        {player.nickname.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-base">
        {player.nickname}
      </span>
      {isSelf ? (
        <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          You
        </span>
      ) : null}
      {player.isHost ? (
        <span className="rounded-full bg-violet-600/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
          Host
        </span>
      ) : null}
    </li>
  );
}

function Shell({ children }: { readonly children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-16">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-lg font-black tracking-tight">
          Puncline<span className="text-violet-400">.</span>
        </Link>
        <ConnectionBadge />
      </div>
      {children}
    </main>
  );
}
