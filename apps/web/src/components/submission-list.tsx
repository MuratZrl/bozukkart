'use client';

import type { PlayerSnapshot, PromptCard, SubmissionView } from '@bozukkart/shared';
import { useEffect, useState, type CSSProperties } from 'react';

import type { Translate } from '@/components/bozukkart-provider';
import { PromptView } from '@/components/prompt-view';
import { cardBlockClass, cardTilt } from '@/lib/card-style';

/**
 * The plays on the table. Owners are rendered only when the server has actually
 * sent them, which it does not do until the round is decided.
 *
 * The judge picks the same way a player plays a card: select, then commit. One
 * stray tap should not decide a round.
 */
export function SubmissionList({
  submissions,
  prompt,
  players,
  winningSubmissionId,
  canPick,
  busy,
  onPick,
  t,
}: {
  readonly submissions: readonly SubmissionView[];
  readonly prompt: PromptCard;
  readonly players: readonly PlayerSnapshot[];
  readonly winningSubmissionId: string | null;
  readonly canPick: boolean;
  readonly busy: boolean;
  readonly onPick: (submissionId: string) => void;
  readonly t: Translate;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // A different set of plays means a different round.
  const identity = submissions.map((submission) => submission.id).join(',');
  useEffect(() => {
    setSelected(null);
  }, [identity]);

  return (
    <section className="submissions">
      <h3 className="submissions__title font-display text-sm uppercase tracking-widest text-bone-dim">
        {t('game.submissions')}
      </h3>

      <ul className="submissions__list mt-3 grid gap-3">
        {submissions.map((submission, index) => {
          const owner =
            submission.playerId === null
              ? null
              : players.find((player) => player.id === submission.playerId);
          const isWinner = submission.id === winningSubmissionId;
          const isSelected = submission.id === selected;

          const face = (
            <span
              className={`card__block card-block card-mark ${cardBlockClass(submission.id)}`}
            >
              <span className="card__text text-sm font-semibold">
                <PromptView prompt={prompt} filledWith={submission.cards} />
              </span>
            </span>
          );

          const tilt = { '--tilt-base': cardTilt(submission.id) } as CSSProperties;

          return (
            <li
              key={submission.id}
              className="submissions__item deal-in relative"
              style={{ animationDelay: `${String(index * 70)}ms` } as CSSProperties}
              data-winner={isWinner}
            >
              {canPick ? (
                <button
                  type="button"
                  className="card card--play card-face card-tilt block w-full text-left"
                  style={tilt}
                  data-selected={isSelected}
                  aria-pressed={isSelected}
                  disabled={busy}
                  onClick={() => {
                    setSelected(submission.id);
                  }}
                >
                  {face}
                </button>
              ) : (
                <article
                  className="card card--play card-face card-tilt"
                  style={tilt}
                  data-selected={isWinner}
                >
                  {face}
                </article>
              )}

              {isWinner && owner !== null && owner !== undefined ? (
                <span className="stamp">{owner.nickname}</span>
              ) : null}

              {owner === undefined || owner === null ? null : (
                <p className="card__owner mt-1.5 text-center text-xs text-bone-dim">
                  {t('game.playedBy', { nickname: owner.nickname })}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {canPick ? (
        <div className="submissions__actions sticky-actions mt-4">
          <button
            type="button"
            className="submissions__pick btn btn--primary w-full"
            disabled={selected === null || busy}
            onClick={() => {
              if (selected !== null) {
                onPick(selected);
              }
            }}
          >
            {busy ? t('game.picking') : t('game.pickWinner')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
