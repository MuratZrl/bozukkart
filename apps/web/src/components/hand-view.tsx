'use client';

import type { AnswerCard, PromptCard } from '@bozukkart/shared';
import { useEffect, useState } from 'react';

import type { Translate } from '@/components/bozukkart-provider';

/** Shared by the hand and the judge's plays, so both read as the same object. */
export const CARD_BASE_CLASS =
  'w-full h-full rounded-lg border-2 px-3 py-3 text-left text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';
export const CARD_SELECTED_CLASS = 'border-zinc-100 bg-zinc-800';
export const CARD_IDLE_CLASS = 'border-zinc-700 hover:border-zinc-500';

/** One affordance for every commit action, obviously dead until it is allowed. */
export const ACTION_BUTTON_CLASS =
  'w-full rounded-lg border-2 border-zinc-100 bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 cursor-pointer disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-transparent disabled:text-zinc-500';

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
    <section className="hand space-y-3">
      <h3 className="hand__title text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('game.yourHand')}
      </h3>
      <p className="hand__instruction text-sm text-zinc-400">
        {prompt.pick === 1
          ? t('game.pickOne')
          : t('game.pickMany', { count: prompt.pick })}
      </p>

      {cards.length === 0 ? (
        <p className="hand__empty text-sm text-zinc-500">{t('game.emptyHand')}</p>
      ) : (
        <ul className="hand__cards grid grid-cols-2 gap-2">
          {cards.map((card) => {
            const order = selected.indexOf(card.id);
            const isSelected = order !== -1;

            return (
              <li key={card.id} className="hand__card">
                <button
                  type="button"
                  className={`card card--answer ${CARD_BASE_CLASS} ${
                    isSelected ? CARD_SELECTED_CLASS : CARD_IDLE_CLASS
                  }`}
                  data-selected={isSelected}
                  aria-pressed={isSelected}
                  disabled={busy}
                  onClick={() => {
                    toggle(card.id);
                  }}
                >
                  <span className="card__text">{card.text}</span>
                  {isSelected && prompt.pick > 1 ? (
                    <span className="card__order ml-2 rounded border border-zinc-100 px-1 text-xs">
                      {order + 1}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className={`hand__submit ${ACTION_BUTTON_CLASS}`}
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
