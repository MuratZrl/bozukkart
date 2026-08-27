'use client';

import type { AnswerCard, PromptCard } from '@bozukkart/shared';
import { useEffect, useState, type CSSProperties } from 'react';

import type { Translate } from '@/components/bozukkart-provider';
import { cardBlockClass, cardTilt } from '@/lib/card-style';

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
      <div className="hand__heading flex items-baseline justify-between gap-3">
        <h3 className="hand__title font-display text-sm uppercase tracking-widest text-bone-dim">
          {t('game.yourHand')}
        </h3>
        <p className="hand__instruction text-xs text-bone-dim">
          {prompt.pick === 1
            ? t('game.pickOne')
            : t('game.pickMany', { count: prompt.pick })}
        </p>
      </div>

      {cards.length === 0 ? (
        <p className="hand__empty mt-4 text-sm text-ash">{t('game.emptyHand')}</p>
      ) : (
        <ul className="hand__cards mt-4 grid grid-cols-2 gap-3">
          {cards.map((card, index) => {
            const order = selected.indexOf(card.id);
            const isSelected = order !== -1;

            return (
              <li
                key={card.id}
                className="hand__card deal-in"
                style={{ animationDelay: `${String(index * 25)}ms` } as CSSProperties}
              >
                <button
                  type="button"
                  className="card card--answer card-face card-tilt relative block h-full w-full min-h-28 text-left"
                  style={{ '--tilt-base': cardTilt(card.id) } as CSSProperties}
                  data-selected={isSelected}
                  aria-pressed={isSelected}
                  disabled={busy}
                  onClick={() => {
                    toggle(card.id);
                  }}
                >
                  <span
                    className={`card__block card-block card-mark ${cardBlockClass(card.id)}`}
                  >
                    <span className="card__text text-sm font-semibold leading-snug">
                      {card.text}
                    </span>
                  </span>

                  {isSelected && prompt.pick > 1 ? (
                    <span className="card__order absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-chip border-2 border-bone-bright bg-ink font-display text-xs text-bone-bright">
                      {order + 1}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Thumb-reachable on a phone, and it follows you down a long hand. */}
      <div className="hand__actions sticky bottom-3 mt-4">
        <button
          type="button"
          className="hand__submit btn btn--primary w-full"
          disabled={!ready || busy}
          onClick={() => {
            onSubmit(selected);
          }}
        >
          {busy ? t('game.submitting') : t('game.submit')}
        </button>
      </div>
    </section>
  );
}
