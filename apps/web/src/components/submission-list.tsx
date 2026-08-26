'use client';

import type { PlayerSnapshot, PromptCard, SubmissionView } from '@bozukkart/shared';

import type { Translate } from '@/components/bozukkart-provider';
import { PromptView } from '@/components/prompt-view';

/**
 * The plays on the table. Owners are rendered only when the server has actually
 * sent them, which it does not do until the round is decided.
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
  return (
    <section className="submissions">
      <h3 className="submissions__title">{t('game.submissions')}</h3>

      <ul className="submissions__list">
        {submissions.map((submission) => {
          const owner =
            submission.playerId === null
              ? null
              : players.find((player) => player.id === submission.playerId);

          return (
            <li
              key={submission.id}
              className="submissions__item"
              data-winner={submission.id === winningSubmissionId}
            >
              <article className="card card--play">
                <PromptView prompt={prompt} filledWith={submission.cards} />

                {owner === undefined || owner === null ? null : (
                  <p className="card__owner">
                    {t('game.playedBy', { nickname: owner.nickname })}
                  </p>
                )}

                {canPick ? (
                  <button
                    type="button"
                    className="submissions__pick"
                    disabled={busy}
                    onClick={() => {
                      onPick(submission.id);
                    }}
                  >
                    {busy ? t('game.picking') : t('game.pickWinner')}
                  </button>
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
