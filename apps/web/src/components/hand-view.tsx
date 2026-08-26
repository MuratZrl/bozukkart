'use client';

import type { AnswerCard, PromptCard } from '@bozukkart/shared';
import { useEffect, useState } from 'react';

import type { Translate } from '@/components/bozukkart-provider';

/**
 * The player's own cards and the pick they are building. Selection order is
 * preserved because a two-blank prompt reads differently the other way round.
 */
export function HandView({
  cards,
  prompt,
  busy,
  onSubmit,
  t,
}: {
  readonly cards: readonly AnswerCard[];
  readonly prompt: PromptCard;
  readonly busy: boolean;
  readonly onSubmit: (cardIds: readonly string[]) => void;
  readonly t: Translate;
}) {
  const [selected, setSelected] = useState<readonly string[]>([]);

  // A new prompt means the half-built pick from the last round is meaningless.
  useEffect(() => {
    setSelected([]);
  }, [prompt.id]);

  function toggle(cardId: string): void {
    setSelected((current) => {
      if (current.includes(cardId)) {
        return current.filter((id) => id !== cardId);
      }

      if (current.length >= prompt.pick) {
        // Full: replace the oldest pick so tapping never dead-ends.
        return [...current.slice(1), cardId];
      }

      return [...current, cardId];
    });
  }

  const ready = selected.length === prompt.pick;

  return (
    <section className="hand">
      <h3 className="hand__title">{t('game.yourHand')}</h3>
      <p className="hand__instruction">
        {prompt.pick === 1
          ? t('game.pickOne')
          : t('game.pickMany', { count: prompt.pick })}
      </p>

      {cards.length === 0 ? (
        <p className="hand__empty">{t('game.emptyHand')}</p>
      ) : (
        <ul className="hand__cards">
          {cards.map((card) => {
            const order = selected.indexOf(card.id);

            return (
              <li key={card.id} className="hand__card">
                <button
                  type="button"
                  className="card card--answer"
                  data-selected={order !== -1}
                  aria-pressed={order !== -1}
                  disabled={busy}
                  onClick={() => {
                    toggle(card.id);
                  }}
                >
                  <span className="card__text">{card.text}</span>
                  {order !== -1 && prompt.pick > 1 ? (
                    <span className="card__order">{order + 1}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="hand__submit"
        disabled={!ready || busy}
        onClick={() => {
          onSubmit(selected);
        }}
      >
        {busy ? t('game.submitting') : t('game.submit')}
      </button>
    </section>
  );
}
