'use client';

import {
  BLANK_TOKEN,
  splitPromptText,
  type AnswerCard,
  type PromptCard,
} from '@bozukkart/shared';
import { Fragment } from 'react';

/**
 * Renders a prompt, optionally with answer cards dropped into its blanks.
 * Presentational: it decides nothing about the game. The styling here is the
 * bare minimum to tell a blank apart from a filled-in one.
 */
export function PromptView({
  prompt,
  filledWith = [],
}: {
  readonly prompt: PromptCard;
  readonly filledWith?: readonly AnswerCard[];
}) {
  const chunks = splitPromptText(prompt.text);

  return (
    <p className="prompt leading-relaxed" data-pick={prompt.pick}>
      {chunks.map((chunk, index) => {
        const fill = filledWith[index];

        return (
          <Fragment key={`${prompt.id}-${String(index)}`}>
            <span className="prompt__text">{chunk}</span>
            {index < chunks.length - 1 ? (
              fill === undefined ? (
                // The token itself, not an empty element: an unstyled blank
                // still has to be visible in the sentence.
                <span className="prompt__blank text-zinc-500">{BLANK_TOKEN}</span>
              ) : (
                <span className="prompt__fill font-semibold underline underline-offset-4">
                  {fill.text}
                </span>
              )
            ) : null}
          </Fragment>
        );
      })}
    </p>
  );
}
