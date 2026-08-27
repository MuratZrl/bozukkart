/**
 * Presentation-only helpers. A card's ink and the angle it sits at are derived
 * from its id, so the fan looks untidy but never reshuffles itself on a
 * re-render, and the same card is the same colour for everyone at the table.
 */

const BLOCK_CLASSES = [
  'card-block--blood',
  'card-block--nicotine',
  'card-block--teal',
] as const;

/** Cheap, stable string hash. Not security, just scatter. */
function hash(value: string): number {
  let result = 0;

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) % 100_000;
  }

  return result;
}

/** Which of the three inks this card is printed in. */
export function cardBlockClass(id: string): string {
  return BLOCK_CLASSES[hash(id) % BLOCK_CLASSES.length] ?? BLOCK_CLASSES[0];
}

/**
 * A degree or three off square, either way, never enough to look deliberate.
 * The magnitude stays at or above 1 degree: below that it reads as a rendering
 * defect rather than a card someone dropped on the table.
 */
export function cardTilt(id: string): string {
  const magnitude = 1 + (hash(`${id}-tilt`) % 21) / 10; // 1.0 .. 3.0
  const sign = hash(`${id}-lean`) % 2 === 0 ? 1 : -1;
  return `${(magnitude * sign).toFixed(1)}deg`;
}
