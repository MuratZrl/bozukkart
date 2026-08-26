import type { AnswerCard, PromptCard } from '../cards';
import { LOCALES, type Locale } from '../constants';

import { EN_ANSWERS, EN_PROMPTS } from './en';
import { TR_ANSWERS, TR_PROMPTS } from './tr';

interface PromptSeed {
  readonly text: string;
  readonly pick: number;
}

export interface Deck {
  readonly locale: Locale;
  readonly prompts: readonly PromptCard[];
  readonly answers: readonly AnswerCard[];
}

function buildPrompts(
  locale: Locale,
  seeds: readonly PromptSeed[],
): readonly PromptCard[] {
  return seeds.map((seed, index) => ({
    id: `${locale}-p-${String(index).padStart(3, '0')}`,
    locale,
    text: seed.text,
    pick: seed.pick,
  }));
}

function buildAnswers(
  locale: Locale,
  texts: readonly string[],
): readonly AnswerCard[] {
  return texts.map((text, index) => ({
    id: `${locale}-a-${String(index).padStart(3, '0')}`,
    locale,
    text,
  }));
}

const DECKS: Record<Locale, Deck> = {
  tr: {
    locale: 'tr',
    prompts: buildPrompts('tr', TR_PROMPTS),
    answers: buildAnswers('tr', TR_ANSWERS),
  },
  en: {
    locale: 'en',
    prompts: buildPrompts('en', EN_PROMPTS),
    answers: buildAnswers('en', EN_ANSWERS),
  },
};

/** The whole deck for a locale. A room only ever draws from its own. */
export function getDeck(locale: Locale): Deck {
  return DECKS[locale];
}

/** Every card in every locale, for lookups that do not know the room. */
export function findAnswerCard(id: string): AnswerCard | null {
  for (const locale of LOCALES) {
    const card = DECKS[locale].answers.find((answer) => answer.id === id);
    if (card !== undefined) {
      return card;
    }
  }

  return null;
}
