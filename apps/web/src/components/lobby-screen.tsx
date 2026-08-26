'use client';

import {
  GAME_PHASE,
  MAX_PLAYERS_PER_ROOM,
  NICKNAME_MAX_LENGTH,
  nicknameSchema,
  zodErrorKey,
  type MessageKey,
  type PlayerSnapshot,
  type SocketError,
} from '@bozukkart/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { useBozukkart, useTranslate } from '@/components/bozukkart-provider';
import { ConnectionBadge } from '@/components/connection-badge';
import { GameBoard } from '@/components/game-board';
import { readStoredNickname, storeNickname } from '@/lib/nickname-storage';

export function LobbyScreen({ code }: { readonly code: string }) {
  const router = useRouter();
  const {
    connected,
    room,
    hand,
    playerId,
    rejoining,
    rejoinError,
    joinRoom,
    leaveRoom,
    startGame,
    nextRound,
    submitCards,
    pickWinner,
  } = useBozukkart();
  const t = useTranslate();

  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<SocketError | MessageKey | null>(null);
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

  function render(value: SocketError | MessageKey | null): string | null {
    if (value === null) {
      return null;
    }

    return typeof value === 'string' ? t(value) : t(value.key, value.params);
  }

  async function handleJoin(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setError(zodErrorKey(parsed.error));
      return;
    }

    setBusy(true);
    storeNickname(parsed.data);

    const result = await joinRoom(code, parsed.data);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
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

  /** Every game move goes through here so one failure path serves them all. */
  async function runMove(
    move: () => Promise<{ ok: boolean; error?: SocketError }>,
  ): Promise<void> {
    setBusy(true);
    setError(null);

    const result = await move();
    setBusy(false);

    if (!result.ok && result.error !== undefined) {
      setError(result.error);
    }
  }

  /** A manual attempt's error wins; otherwise say why the automatic one failed. */
  const formError = render(error) ?? render(rejoinError);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError('lobby.copyFailed');
    }
  }

  // In a room, but not this one: happens if someone edits the URL by hand.
  if (room !== null && room.code !== code) {
    return (
      <Shell t={t}>
        <div className="rounded-2xl border border-edge bg-surface p-6 text-center">
          <p className="text-sm text-zinc-300">
            {t('lobby.alreadyInRoom', { current: room.code, target: code })}
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/room/${room.code}`)}
              className="flex-1 rounded-xl border border-edge bg-surface-raised px-4 py-3 text-sm font-semibold transition hover:border-violet-500"
            >
              {t('lobby.backToRoom', { code: room.code })}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLeaveOther()}
              className="flex-1 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
            >
              {t('lobby.leaveThatRoom', { code: room.code })}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // This tab held a seat here and is claiming it back on its own. Showing the
  // form underneath would just invite a second, competing join.
  if (room === null && rejoining) {
    return (
      <Shell t={t}>
        <div className="rounded-2xl border border-edge bg-surface p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t('lobby.gettingYouBack')}
          </p>
          <p className="code-display mt-1 text-4xl font-black text-violet-300">
            {code}
          </p>
          <p
            role="status"
            className="mt-5 flex items-center justify-center gap-2 text-sm text-zinc-400"
          >
            <span
              aria-hidden
              className="size-2 animate-pulse rounded-full bg-violet-400"
            />
            {t('lobby.reconnectingStatus')}
          </p>
          <p className="mt-2 text-xs text-zinc-600">{t('lobby.seatHeldHint')}</p>
        </div>
      </Shell>
    );
  }

  // Not in the room: a shared link, a rejoin the server refused, or a seat that
  // was already given away.
  if (room === null) {
    return (
      <Shell t={t}>
        <form
          onSubmit={handleJoin}
          className="rounded-2xl border border-edge bg-surface p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t('lobby.joiningRoom')}
          </p>
          <p className="code-display mt-1 text-4xl font-black text-violet-300">
            {code}
          </p>

          <label
            className="mt-6 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
            htmlFor="nickname"
          >
            {t('landing.nicknameLabel')}
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
            placeholder={t('landing.nicknamePlaceholder')}
            className="mt-2 w-full rounded-xl border border-edge bg-surface-raised px-4 py-3 text-base outline-none placeholder:text-zinc-600 focus:border-violet-500"
          />

          <button
            type="submit"
            disabled={busy || !connected}
            className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t('landing.joining') : t('lobby.joinRoom')}
          </button>

          {formError === null ? null : (
            <p role="alert" className="mt-4 text-sm text-rose-400">
              {formError}
            </p>
          )}

          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-4 w-full text-center text-xs text-zinc-500 underline-offset-4 hover:underline"
          >
            {t('lobby.backToStart')}
          </button>
        </form>
      </Shell>
    );
  }

  const inLobbyPhase = room.game.phase === GAME_PHASE.Lobby;

  return (
    <Shell t={t}>
      {inLobbyPhase ? (
        <section className="rounded-2xl border border-edge bg-surface p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t('lobby.roomCode')}
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
              {copied ? t('lobby.copied') : t('lobby.copy')}
            </button>
          </div>
          <p className="mt-3 text-sm text-zinc-500">{t('lobby.shareHint')}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-edge bg-surface p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {inLobbyPhase ? t('lobby.players') : t('game.scoreboard')}
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
              isJudge={player.id === room.game.judgeId}
              showScore={!inLobbyPhase}
              t={t}
            />
          ))}
        </ul>
      </section>

      <div className="rounded-2xl border border-edge bg-surface p-6">
        <GameBoard
          room={room}
          playerId={playerId ?? ''}
          hand={hand}
          busy={busy}
          onStart={() => void runMove(startGame)}
          onNextRound={() => void runMove(nextRound)}
          onSubmit={(cardIds) => void runMove(() => submitCards(cardIds))}
          onPickWinner={(submissionId) =>
            void runMove(() => pickWinner(submissionId))
          }
          t={t}
        />
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleLeave()}
        className="text-center text-sm text-zinc-500 underline-offset-4 transition hover:text-rose-400 hover:underline disabled:opacity-40"
      >
        {t('lobby.leaveRoom')}
      </button>

      {formError === null ? null : (
        <p role="alert" className="text-center text-sm text-rose-400">
          {formError}
        </p>
      )}
    </Shell>
  );
}

function PlayerRow({
  player,
  isSelf,
  isJudge,
  showScore,
  t,
}: {
  readonly player: PlayerSnapshot;
  readonly isSelf: boolean;
  readonly isJudge: boolean;
  readonly showScore: boolean;
  readonly t: (key: MessageKey, params?: Record<string, string | number>) => string;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border border-edge bg-surface-raised px-4 py-3 transition ${
        player.connected ? '' : 'opacity-45'
      }`}
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-sm font-bold text-violet-300"
      >
        {player.nickname.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-base">
        {player.nickname}
      </span>
      {showScore ? (
        <span className="rounded-full border border-edge px-2 py-0.5 text-xs font-bold tabular-nums text-zinc-300">
          {t('game.score', { score: player.score })}
        </span>
      ) : null}
      {isJudge ? (
        <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
          {t('lobby.judge')}
        </span>
      ) : null}
      {player.connected ? null : (
        <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
          {t('lobby.reconnecting')}
        </span>
      )}
      {isSelf ? (
        <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          {t('lobby.you')}
        </span>
      ) : null}
      {player.isHost ? (
        <span className="rounded-full bg-violet-600/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
          {t('lobby.host')}
        </span>
      ) : null}
    </li>
  );
}

function Shell({
  children,
  t,
}: {
  readonly children: ReactNode;
  readonly t: (key: MessageKey) => string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-16">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-lg font-black tracking-tight">
          {t('app.name')}
          <span className="text-violet-400">.</span>
        </Link>
        <ConnectionBadge />
      </div>
      {children}
    </main>
  );
}
