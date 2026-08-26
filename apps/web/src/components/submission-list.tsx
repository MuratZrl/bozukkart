'use client';

import type { PlayerSnapshot, PromptCard, SubmissionView } from '@bozukkart/shared';
import { useEffect, useState } from 'react';

import type { Translate } from '@/components/bozukkart-provider';
import {
  ACTION_BUTTON_CLASS,
  CARD_BASE_CLASS,
  CARD_IDLE_CLASS,
  CARD_SELECTED_CLASS,
} from '@/components/hand-view';
import { PromptView } from '@/components/prompt-view';

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
    <section className="submissions space-y-3">
      <h3 className="submissions__title text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('game.submissions')}
      </h3>

      <ul className="submissions__list grid gap-2">
        {submissions.map((submission) => {
          const owner =
            submission.playerId === null
              ? null
              : players.find((player) => player.id === submission.playerId);
          const isWinner = submission.id === winningSubmissionId;
          const isSelected = submission.id === selected;
          const highlighted = canPick ? isSelected : isWinner;

          const body = (
            <>
              <PromptView prompt={prompt} filledWith={submission.cards} />
              {owner === undefined || owner === null ? null : (
                <p className="card__owner mt-2 text-xs text-zinc-400">
                  {t('game.playedBy', { nickname: owner.nickname })}
                </p>
              )}
            </>
          );

          return (
            <li
              key={submission.id}
              className="submissions__item"
              data-winner={isWinner}
            >
              {canPick ? (
                <button
                  type="button"
                  className={`card card--play ${CARD_BASE_CLASS} ${
                    highlighted ? CARD_SELECTED_CLASS : CARD_IDLE_CLASS
                  }`}
                  data-selected={isSelected}
                  aria-pressed={isSelected}
                  disabled={busy}
                  onClick={() => {
                    setSelected(submission.id);
                  }}
                >
                  {body}
                </button>
              ) : (
                <article
                  className={`card card--play rounded-lg border-2 px-3 py-3 text-sm ${
                    highlighted ? CARD_SELECTED_CLASS : 'border-zinc-700'
                  }`}
                >
                  {body}
                </article>
              )}
            </li>
          );
        })}
      </ul>

      {canPick ? (
        <button
          type="button"
          className={`submissions__pick ${ACTION_BUTTON_CLASS}`}
          disabled={selected === null || busy}
          onClick={() => {
            if (selected !== null) {
              onPick(selected);
            }
          }}
        >
          {busy ? t('game.picking') : t('game.pickWinner')}
        </button>
      ) : null}
    </section>
  );
}
