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
 * Purely presentational: it decides nothing about the game and carries no
 * styling of its own.
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
    <p className="prompt" data-pick={prompt.pick}>
      {chunks.map((chunk, index) => {
        const fill = filledWith[index];

        return (
          <Fragment key={`${prompt.id}-${String(index)}`}>
            <span className="prompt__text">{chunk}</span>
            {index < chunks.length - 1 ? (
              fill === undefined ? (
                // The token itself, not an empty element: an unstyled blank
                // still has to be visible in the sentence.
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
