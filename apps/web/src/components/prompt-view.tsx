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
 * Presentational: it decides nothing about the game. A blank is drawn as a
 * ruled line rather than printed underscores; the token stays in the markup so
 * the sentence still reads correctly to a screen reader.
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
    <p className="prompt leading-snug" data-pick={prompt.pick}>
      {chunks.map((chunk, index) => {
        const fill = filledWith[index];

        return (
          <Fragment key={`${prompt.id}-${String(index)}`}>
            <span className="prompt__text">{chunk}</span>
            {index < chunks.length - 1 ? (
              fill === undefined ? (
                <span className="prompt__blank">{BLANK_TOKEN}</span>
              ) : (
                <span className="prompt__fill">{fill.text}</span>
              )
            ) : null}
          </Fragment>
        );
      })}
    </p>
  );
}
