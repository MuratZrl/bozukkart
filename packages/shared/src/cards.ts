import { BLANK_TOKEN, type Locale } from './constants';

/**
 * A prompt card: the sentence with holes in it that the judge reads out. `pick`
 * is how many answer cards it takes, which is either the number of blanks or 1
 * for prompts phrased as a question.
 */
export interface PromptCard {
  readonly id: string;
  readonly locale: Locale;
  readonly text: string;
  readonly pick: number;
}

/** An answer card: one plain phrase, no formatting, no blanks. */
export interface AnswerCard {
  readonly id: string;
  readonly locale: Locale;
  readonly text: string;
}

export function countBlanks(text: string): number {
  return text.split(BLANK_TOKEN).length - 1;
}

/**
 * Splits a prompt into the literal chunks around its blanks, so a client can
 * render the filled-in sentence without doing string surgery of its own.
 * A prompt with no blanks comes back as a single chunk.
 */
export function splitPromptText(text: string): readonly string[] {
  return text.split(BLANK_TOKEN);
}
