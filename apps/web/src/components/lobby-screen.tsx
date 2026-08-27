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
import { roomInviteUrl } from '@/lib/site';

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
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setNickname(readStoredNickname());
  }, []);

  // Never checked during render: the server has no `navigator`, so the first
  // client pass has to agree with it and only then tell the truth.
  useEffect(() => {
    setCanShare(typeof navigator.share === 'function');
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

  /**
   * Hand over a link, not four letters: the receiver taps it and is in the
   * room. Where the platform has a share sheet that is the shorter path, and
   * the clipboard is what everything else gets.
   *
   * `navigator.share` must be reached before this function awaits anything
   * else, or the transient user activation the call needs is already gone.
   */
  async function handleInvite(): Promise<void> {
    setError(null);
    const url = roomInviteUrl(code);

    if (canShare) {
      try {
        await navigator.share({
          title: t('app.name'),
          text: t('meta.roomOgTitle', { code }),
          url,
        });
        return;
      } catch (cause) {
        // Backing out of the sheet is a decision, not a failure. Anything else
        // — no share target, a rejected permission — falls through to the
        // clipboard rather than dead-ending.
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }
      }
    }

    try {
      // Undefined on an insecure origin, which throws here and is caught with
      // every other reason the write can fail.
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('lobby.copyFailed');
    }
  }

  // In a room, but not this one: happens if someone edits the URL by hand.
  if (room !== null && room.code !== code) {
    return (
      <Shell t={t}>
        <div className="panel space-y-4 text-center">
          <p className="text-sm text-bone-dim">
            {t('lobby.alreadyInRoom', { current: room.code, target: code })}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn--ghost w-full"
              onClick={() => router.push(`/room/${room.code}`)}
            >
              {t('lobby.backToRoom', { code: room.code })}
            </button>
            <button
              type="button"
              className="btn btn--primary w-full"
              disabled={busy}
              onClick={() => void handleLeaveOther()}
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
        <div className="panel space-y-3 text-center">
          <p className="font-display text-xs uppercase tracking-widest text-ash">
            {t('lobby.gettingYouBack')}
          </p>
          <p className="code-display text-5xl leading-none">{code}</p>
          <p role="status" className="text-sm text-bone-dim">
            {t('lobby.reconnectingStatus')}
          </p>
          <p className="text-xs text-ash">{t('lobby.seatHeldHint')}</p>
        </div>
      </Shell>
    );
  }

  // Not in the room: a shared link, a rejoin the server refused, or a seat that
  // was already given away.
  if (room === null) {
    return (
      <Shell t={t}>
        <form onSubmit={handleJoin} className="panel space-y-4">
          <div className="text-center">
            <p className="font-display text-xs uppercase tracking-widest text-ash">
              {t('lobby.joiningRoom')}
            </p>
            <p className="code-display mt-1 text-5xl leading-none">{code}</p>
          </div>

          <div>
            <label
              className="font-display text-xs uppercase tracking-widest text-ash"
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
              className="field mt-2 text-base"
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary w-full text-base"
            disabled={busy || !connected}
          >
            {busy ? t('landing.joining') : t('lobby.joinRoom')}
          </button>

          {formError === null ? null : (
            <p role="alert" className="text-sm text-blood">
              {formError}
            </p>
          )}

          <button
            type="button"
            className="btn btn--quiet w-full text-xs"
            onClick={() => router.push('/')}
          >
            {t('lobby.backToStart')}
          </button>
        </form>
      </Shell>
    );
  }

  const inLobbyPhase = room.game.phase === GAME_PHASE.Lobby;

  function labelInvite(): MessageKey {
    if (copied) {
      return 'lobby.copied';
    }

    return canShare ? 'lobby.share' : 'lobby.copy';
  }

  const inviteLabel = t(labelInvite());

  return (
    <Shell t={t}>
      {inLobbyPhase ? (
        <section className="panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-xs uppercase tracking-widest text-ash">
                {t('lobby.roomCode')}
              </p>
              <p className="code-display mt-1 text-6xl leading-none">
                {room.code}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost shrink-0 px-3 py-1.5 text-xs"
              aria-label={
                canShare ? t('lobby.shareLinkLabel') : t('lobby.copyLinkLabel')
              }
              onClick={() => void handleInvite()}
            >
              {inviteLabel}
            </button>
          </div>
          {/*
           * The hint doubles as the confirmation, so the copy is announced
           * without a second line appearing and shoving the board down.
           */}
          <p
            role="status"
            className={`mt-3 text-xs ${copied ? 'text-bone-dim' : 'text-ash'}`}
          >
            {copied ? t('lobby.linkCopied') : t('lobby.shareHint')}
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-sm uppercase tracking-widest text-bone-dim">
            {inLobbyPhase ? t('lobby.players') : t('game.scoreboard')}
          </h2>
          <span className="text-xs text-ash">
            {room.players.length} / {MAX_PLAYERS_PER_ROOM}
          </span>
        </div>

        <ul className="mt-3 space-y-1.5">
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

      <div className="panel">
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

      {formError === null ? null : (
        <p role="alert" className="text-center text-sm text-blood">
          {formError}
        </p>
      )}

      <button
        type="button"
        className="btn btn--quiet mx-auto text-xs"
        disabled={busy}
        onClick={() => void handleLeave()}
      >
        {t('lobby.leaveRoom')}
      </button>
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
      className={`flex items-center gap-2 rounded-lg border border-felt-raised bg-ink-deep px-2.5 py-2 ${
        player.connected ? '' : 'opacity-45'
      }`}
    >
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-chip border border-ash font-display text-xs text-bone-dim"
      >
        {player.nickname.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{player.nickname}</span>

      {showScore ? (
        <span className="font-display text-lg leading-none tabular-nums text-nicotine">
          {t('game.score', { score: player.score })}
        </span>
      ) : null}
      {isJudge ? <span className="chip chip--judge">{t('lobby.judge')}</span> : null}
      {player.connected ? null : (
        <span className="chip chip--away">{t('lobby.reconnecting')}</span>
      )}
      {isSelf ? <span className="chip chip--self">{t('lobby.you')}</span> : null}
      {player.isHost ? (
        <span className="chip chip--host">{t('lobby.host')}</span>
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="font-display text-2xl uppercase leading-none tracking-tight"
        >
          {t('app.name')}
          <span className="text-blood">.</span>
        </Link>
        <ConnectionBadge />
      </div>
      {children}
    </main>
  );
}
