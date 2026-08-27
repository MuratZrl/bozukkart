'use client';

import {
  GAME_PHASE,
  MIN_PLAYERS_TO_START,
  type HandSnapshot,
  type PromptCard,
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
      <section className="game game--lobby space-y-3 text-center">
        {isHost ? (
          <>
            <button
              type="button"
              className="game__action btn btn--primary w-full"
              disabled={busy || !enoughPlayers}
              onClick={onStart}
            >
              {busy ? t('game.starting') : t('game.startGame')}
            </button>
            {enoughPlayers ? null : (
              <p className="game__hint text-sm text-bone-dim">
                {t('game.needMorePlayers', { min: MIN_PLAYERS_TO_START })}
              </p>
            )}
          </>
        ) : (
          <p className="game__status text-sm text-bone-dim">
            {t('game.waitingForHostToStart')}
          </p>
        )}
      </section>
    );
  }

  if (game.phase === GAME_PHASE.Paused) {
    return (
      <section className="game game--paused space-y-3 text-center">
        <h2 className="game__heading font-display text-2xl uppercase tracking-wide text-blood">
          {t('game.paused')}
        </h2>
        <p className="game__hint text-sm text-bone-dim">
          {t('game.pausedHint', { min: MIN_PLAYERS_TO_START })}
        </p>
        {isHost ? (
          <button
            type="button"
            className="game__action btn btn--primary w-full"
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
  const decided =
    game.phase === GAME_PHASE.RoundResult || game.phase === GAME_PHASE.GameOver;

  return (
    <section className="game space-y-5" data-phase={game.phase}>
      <header className="game__header flex items-center justify-between gap-3">
        <div>
          <p className="game__round font-display text-lg uppercase tracking-wide">
            {t('game.round', { number: game.roundNumber })}
          </p>
          <p className="game__target text-xs text-ash">
            {t('game.targetScore', { score: room.targetScore })}
          </p>
        </div>
        <p
          className={`game__judge chip ${isJudge ? 'chip--judge' : ''} shrink-0`}
        >
          {isJudge
            ? t('game.youAreJudge')
            : t('game.judgeIs', { nickname: nicknameOf(game.judgeId) })}
        </p>
      </header>

      {prompt === null ? null : <JokerCard prompt={prompt} />}

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

      {(game.phase === GAME_PHASE.Judging || decided) && prompt !== null ? (
        <>
          <p className="game__status text-center text-sm text-bone-dim">
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
            className="game__action btn btn--primary w-full"
            disabled={busy || !enoughPlayers}
            onClick={onNextRound}
          >
            {busy ? t('game.advancing') : t('game.nextRound')}
          </button>
        ) : (
          <p className="game__hint text-center text-sm text-ash">
            {t('game.waitingForHostNextRound')}
          </p>
        )
      ) : null}

      {game.phase === GAME_PHASE.GameOver ? (
        <section className="game__over space-y-3 text-center">
          <h2 className="game__heading font-display text-3xl uppercase tracking-wide text-nicotine">
            {t('game.gameOver')}
          </h2>
          <p className="game__winner font-display text-xl uppercase tracking-wide">
            {t('game.gameWinner', { nickname: nicknameOf(game.gameWinnerId) })}
          </p>
          {isHost ? (
            <button
              type="button"
              className="game__action btn btn--primary w-full"
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

/** The prompt stands alone: darker stock, ornate frame, display type. */
function JokerCard({ prompt }: { readonly prompt: PromptCard }) {
  return (
    <div className="game__prompt joker relative deal-in">
      <div className="joker__inner card-mark">
        <div className="font-display text-xl uppercase leading-tight tracking-wide text-center">
          <PromptView prompt={prompt} />
        </div>
      </div>
    </div>
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
  readonly prompt: PromptCard;
  readonly awaiting: readonly string[];
  readonly busy: boolean;
  readonly onSubmit: (cardIds: readonly string[]) => void;
  readonly t: Translate;
}) {
  if (isJudge) {
    return (
      <div className="game__waiting space-y-2 text-center">
        <p className="game__status text-sm text-bone-dim">
          {t('game.judgeWaiting')}
        </p>
        {awaiting.length === 0 ? null : (
          <p className="game__hint text-xs text-ash">
            {t('game.waitingOn', { players: awaiting.join(', ') })}
          </p>
        )}
      </div>
    );
  }

  const alreadyPlayed = hand !== null && hand.submitted.length > 0;

  if (alreadyPlayed) {
    return (
      <div className="game__played space-y-3">
        <p className="game__status text-center text-sm text-bone-dim">
          {t('game.submitted')}
        </p>
        <h3 className="game__subheading font-display text-sm uppercase tracking-widest text-ash">
          {t('game.yourSubmission')}
        </h3>
        <div className="card card--played card-face">
          <div className="card__block card-block card-mark card-block--teal">
            <span className="text-sm font-semibold">
              <PromptView prompt={prompt} filledWith={hand.submitted} />
            </span>
          </div>
        </div>
        {awaiting.length === 0 ? null : (
          <p className="game__hint text-center text-xs text-ash">
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
