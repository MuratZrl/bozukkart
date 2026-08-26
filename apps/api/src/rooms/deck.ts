import { randomInt } from 'node:crypto';

import { getDeck, type AnswerCard, type Locale, type PromptCard } from '@bozukkart/shared';

import type { DeckState } from './rooms.types';

/** Fisher-Yates on a copy, using the same CSPRNG the room codes use. */
export function shuffle<TItem>(items: readonly TItem[]): TItem[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    const a = result[index];
    const b = result[swap];

    if (a !== undefined && b !== undefined) {
      result[index] = b;
      result[swap] = a;
    }
  }

  return result;
}

export function createDeckState(locale: Locale): DeckState {
  const deck = getDeck(locale);

  return {
    promptDraw: shuffle(deck.prompts),
    promptDiscard: [],
    answerDraw: shuffle(deck.answers),
    answerDiscard: [],
  };
}

/**
 * Draws one prompt, reshuffling the discard pile when the draw pile runs dry.
 * Null only if the locale has no prompt cards at all.
 */
export function drawPrompt(deck: DeckState): PromptCard | null {
  if (deck.promptDraw.length === 0) {
    deck.promptDraw = shuffle(deck.promptDiscard);
    deck.promptDiscard = [];
  }

  return deck.promptDraw.pop() ?? null;
}

/**
 * Draws one answer. Null when every card is either in a hand or on the table,
 * which the placeholder deck can hit at high player counts; callers deal a
 * short hand rather than failing the round.
 */
export function drawAnswer(deck: DeckState): AnswerCard | null {
  if (deck.answerDraw.length === 0) {
    deck.answerDraw = shuffle(deck.answerDiscard);
    deck.answerDiscard = [];
  }

  return deck.answerDraw.pop() ?? null;
}

export function discardPrompt(deck: DeckState, card: PromptCard): void {
  deck.promptDiscard.push(card);
}

export function discardAnswers(
  deck: DeckState,
  cards: readonly AnswerCard[],
): void {
  deck.answerDiscard.push(...cards);
}
