'use client';

import {
  GAME_PHASE,
  MIN_PLAYERS_TO_START,
  type HandSnapshot,
  type RoomSnapshot,
} from '@bozukkart/shared';

import type { Translate } from '@/components/bozukkart-provider';
import { HandView } from '@/components/hand-view';
import { PromptView } from '@/components/prompt-view';
import { SubmissionList } from '@/components/submission-list';

/**
 * Renders whatever the current phase calls for. Every transition below is a
 * button someone presses; nothing here runs on a clock.
 */
export function GameBoard({
  room,
  playerId,
  hand,
  busy,
  onStart,
  onNextRound,
  onSubmit,
  onPickWinner,
  t,
}: {
  readonly room: RoomSnapshot;
  readonly playerId: string;
  readonly hand: HandSnapshot | null;
  readonly busy: boolean;
  readonly onStart: () => void;
  readonly onNextRound: () => void;
  readonly onSubmit: (cardIds: readonly string[]) => void;
  readonly onPickWinner: (submissionId: string) => void;
  readonly t: Translate;
}) {
  const { game } = room;
  const isHost = room.hostId === playerId;
  const isJudge = game.judgeId === playerId;
  const nicknameOf = (id: string | null): string =>
    room.players.find((player) => player.id === id)?.nickname ?? '';

  const enoughPlayers =
    room.players.filter((player) => player.connected).length >=
    MIN_PLAYERS_TO_START;

  if (game.phase === GAME_PHASE.Lobby) {
    return (
      <section className="game game--lobby">
        <p className="game__status">
          {isHost ? '' : t('game.waitingForHostToStart')}
        </p>
        {isHost ? (
          <>
            <button
              type="button"
              className="game__action"
              disabled={busy || !enoughPlayers}
              onClick={onStart}
            >
              {busy ? t('game.starting') : t('game.startGame')}
            </button>
            {enoughPlayers ? null : (
              <p className="game__hint">
                {t('game.needMorePlayers', { min: MIN_PLAYERS_TO_START })}
              </p>
            )}
          </>
        ) : null}
      </section>
    );
  }

  if (game.phase === GAME_PHASE.Paused) {
    return (
      <section className="game game--paused">
        <h2 className="game__heading">{t('game.paused')}</h2>
        <p className="game__hint">
          {t('game.pausedHint', { min: MIN_PLAYERS_TO_START })}
        </p>
        {isHost ? (
          <button
            type="button"
            className="game__action"
            disabled={busy || !enoughPlayers}
            onClick={onNextRound}
          >
            {busy ? t('game.advancing') : t('game.resume')}
          </button>
        ) : null}
      </section>
    );
  }

  const prompt = game.prompt;

  return (
    <section className="game" data-phase={game.phase}>
      <header className="game__header">
        <p className="game__round">
          {t('game.round', { number: game.roundNumber })}
        </p>
        <p className="game__target">
          {t('game.targetScore', { score: room.targetScore })}
        </p>
        <p className="game__judge">
          {isJudge
            ? t('game.youAreJudge')
            : t('game.judgeIs', { nickname: nicknameOf(game.judgeId) })}
        </p>
      </header>

      {prompt === null ? null : (
        <div className="game__prompt">
          <PromptView prompt={prompt} />
        </div>
      )}

      {game.phase === GAME_PHASE.Selecting && prompt !== null ? (
        <SelectingView
          isJudge={isJudge}
          hand={hand}
          prompt={prompt}
          awaiting={game.awaitingPlayerIds.map(nicknameOf).filter(Boolean)}
          busy={busy}
          onSubmit={onSubmit}
          t={t}
        />
      ) : null}

      {(game.phase === GAME_PHASE.Judging ||
        game.phase === GAME_PHASE.RoundResult ||
        game.phase === GAME_PHASE.GameOver) &&
      prompt !== null ? (
        <>
          <p className="game__status">
            {game.phase === GAME_PHASE.Judging
              ? isJudge
                ? t('game.judgePickWinner')
                : t('game.waitingForJudge')
              : t('game.roundWinner', { nickname: nicknameOf(game.roundWinnerId) })}
          </p>

          <SubmissionList
            submissions={game.submissions}
            prompt={prompt}
            players={room.players}
            winningSubmissionId={game.winningSubmissionId}
            canPick={isJudge && game.phase === GAME_PHASE.Judging}
            busy={busy}
            onPick={onPickWinner}
            t={t}
          />
        </>
      ) : null}

      {game.phase === GAME_PHASE.RoundResult ? (
        isHost ? (
          <button
            type="button"
            className="game__action"
            disabled={busy || !enoughPlayers}
            onClick={onNextRound}
          >
            {busy ? t('game.advancing') : t('game.nextRound')}
          </button>
        ) : (
          <p className="game__hint">{t('game.waitingForHostNextRound')}</p>
        )
      ) : null}

      {game.phase === GAME_PHASE.GameOver ? (
        <section className="game__over">
          <h2 className="game__heading">{t('game.gameOver')}</h2>
          <p className="game__winner">
            {t('game.gameWinner', { nickname: nicknameOf(game.gameWinnerId) })}
          </p>
          {isHost ? (
            <button
              type="button"
              className="game__action"
              disabled={busy || !enoughPlayers}
              onClick={onStart}
            >
              {busy ? t('game.starting') : t('game.playAgain')}
            </button>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function SelectingView({
  isJudge,
  hand,
  prompt,
  awaiting,
  busy,
  onSubmit,
  t,
}: {
  readonly isJudge: boolean;
  readonly hand: HandSnapshot | null;
  readonly prompt: Parameters<typeof PromptView>[0]['prompt'];
  readonly awaiting: readonly string[];
  readonly busy: boolean;
  readonly onSubmit: (cardIds: readonly string[]) => void;
  readonly t: Translate;
}) {
  if (isJudge) {
    return (
      <div className="game__waiting">
        <p className="game__status">{t('game.judgeWaiting')}</p>
        {awaiting.length === 0 ? null : (
          <p className="game__hint">
            {t('game.waitingOn', { players: awaiting.join(', ') })}
          </p>
        )}
      </div>
    );
  }

  const alreadyPlayed = hand !== null && hand.submitted.length > 0;

  if (alreadyPlayed) {
    return (
      <div className="game__played">
        <p className="game__status">{t('game.submitted')}</p>
        <h3 className="game__subheading">{t('game.yourSubmission')}</h3>
        <PromptView prompt={prompt} filledWith={hand.submitted} />
        {awaiting.length === 0 ? null : (
          <p className="game__hint">
            {t('game.waitingOn', { players: awaiting.join(', ') })}
          </p>
        )}
      </div>
    );
  }

  return (
    <HandView
      cards={hand?.cards ?? []}
      prompt={prompt}
      busy={busy}
      onSubmit={onSubmit}
      t={t}
    />
  );
}
