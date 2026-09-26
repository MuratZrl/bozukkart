import { z } from 'zod';

import {
  DEFAULT_TARGET_SCORE,
  LOCALES,
  MAX_PICK,
  MAX_TARGET_SCORE,
  MIN_TARGET_SCORE,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
} from './constants';
import { isMessageKey, type MessageKey, type TranslationParams } from './i18n';

/** C0 and C1 control characters, built from escapes to keep the source ASCII. */
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g');

/**
 * Collapse whitespace and drop control characters so a nickname cannot smuggle
 * newlines, ANSI escapes or zero-width padding into other clients' UIs.
 */
function normaliseNickname(value: string): string {
  return value.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim();
}

/**
 * Zod's message slot carries a dictionary key rather than a sentence, so a
 * rejected payload comes back translatable instead of hardcoded English.
 */
export const nicknameSchema = z
  .string()
  .transform(normaliseNickname)
  .pipe(
    z
      .string()
      .min(NICKNAME_MIN_LENGTH, 'errors.nicknameTooShort')
      .max(NICKNAME_MAX_LENGTH, 'errors.nicknameTooLong'),
  );

export const roomCodeSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.string().regex(ROOM_CODE_PATTERN, 'errors.invalidRoomCode'));

/**
 * Identity is client-generated and lives in the browser's local storage, so a
 * player keeps their seat across a refresh or a dropped socket. It is not a
 * credential: anyone can send any id, which is why a player id alone never
 * grants access to a room the server has not already put them in.
 */
export const playerIdSchema = z.uuid('errors.invalidPlayerId');

export const localeSchema = z.enum(LOCALES, 'errors.invalidLocale');

export const targetScoreSchema = z
  .number()
  .int('errors.invalidTargetScore')
  .min(MIN_TARGET_SCORE, 'errors.invalidTargetScore')
  .max(MAX_TARGET_SCORE, 'errors.invalidTargetScore');

/** Deck card ids look like `tr-a-007`; anything else never existed. */
export const cardIdSchema = z
  .string()
  .regex(/^[a-z]{2}-[pa]-\d{3}$/, 'errors.invalidCardId');

export const submissionIdSchema = z.uuid('errors.invalidSubmissionId');

export const createRoomSchema = z.strictObject({
  playerId: playerIdSchema,
  nickname: nicknameSchema,
  locale: localeSchema,
  targetScore: targetScoreSchema.default(DEFAULT_TARGET_SCORE),
});

export const joinRoomSchema = z.strictObject({
  playerId: playerIdSchema,
  code: roomCodeSchema,
  nickname: nicknameSchema,
});

export const submitCardsSchema = z.strictObject({
  cardIds: z.array(cardIdSchema).min(1, 'errors.wrongPickCount').max(MAX_PICK, 'errors.wrongPickCount'),
});

export const pickWinnerSchema = z.strictObject({
  submissionId: submissionIdSchema,
});

/** What the client puts on the wire. */
export type CreateRoomPayload = z.input<typeof createRoomSchema>;
export type JoinRoomPayload = z.input<typeof joinRoomSchema>;
export type SubmitCardsPayload = z.input<typeof submitCardsSchema>;
export type PickWinnerPayload = z.input<typeof pickWinnerSchema>;

/** What the server works with after validation and normalisation. */
export type CreateRoomCommand = z.output<typeof createRoomSchema>;
export type JoinRoomCommand = z.output<typeof joinRoomSchema>;
export type SubmitCardsCommand = z.output<typeof submitCardsSchema>;
export type PickWinnerCommand = z.output<typeof pickWinnerSchema>;

/** A dictionary key and whatever its template needs filled in. */
export interface ErrorMessage {
  readonly key: MessageKey;
  readonly params?: TranslationParams;
}

/**
 * The numbers the schema messages above quote. Read from the same constants
 * the schemas enforce, so a limit cannot change without its message following.
 */
const SCHEMA_MESSAGE_PARAMS: Partial<Record<MessageKey, TranslationParams>> = {
  'errors.nicknameTooShort': { min: NICKNAME_MIN_LENGTH },
  'errors.nicknameTooLong': { max: NICKNAME_MAX_LENGTH },
  'errors.invalidRoomCode': { length: ROOM_CODE_LENGTH },
  'errors.invalidTargetScore': { min: MIN_TARGET_SCORE, max: MAX_TARGET_SCORE },
};

/**
 * Why a payload was rejected, ready for `translate`. Schemas carry keys in their
 * message slot, but zod's own built-in messages (wrong type, unknown key) are
 * plain English, so anything unrecognised collapses to the generic key.
 */
export function zodErrorKey(
  error: z.ZodError,
  fallback: MessageKey = 'errors.invalidPayload',
): ErrorMessage {
  const [issue] = error.issues;
  const key = isMessageKey(issue?.message) ? issue.message : fallback;
  const params = SCHEMA_MESSAGE_PARAMS[key];

  return params === undefined ? { key } : { key, params };
}
