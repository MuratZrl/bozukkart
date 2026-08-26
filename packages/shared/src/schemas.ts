import { z } from 'zod';

import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
} from './constants';

/** C0 and C1 control characters, built from escapes to keep the source ASCII. */
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g');

/**
 * Collapse whitespace and drop control characters so a nickname cannot smuggle
 * newlines, ANSI escapes or zero-width padding into other clients' UIs.
 */
function normaliseNickname(value: string): string {
  return value.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim();
}

export const nicknameSchema = z
  .string()
  .transform(normaliseNickname)
  .pipe(
    z
      .string()
      .min(
        NICKNAME_MIN_LENGTH,
        `Nickname must be at least ${NICKNAME_MIN_LENGTH} characters.`,
      )
      .max(
        NICKNAME_MAX_LENGTH,
        `Nickname must be at most ${NICKNAME_MAX_LENGTH} characters.`,
      ),
  );

export const roomCodeSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        ROOM_CODE_PATTERN,
        `Room code must be ${ROOM_CODE_LENGTH} letters (I and O are never used).`,
      ),
  );

export const createRoomSchema = z.strictObject({
  nickname: nicknameSchema,
});

export const joinRoomSchema = z.strictObject({
  code: roomCodeSchema,
  nickname: nicknameSchema,
});

/** What the client puts on the wire. */
export type CreateRoomPayload = z.input<typeof createRoomSchema>;
export type JoinRoomPayload = z.input<typeof joinRoomSchema>;

/** What the server works with after validation and normalisation. */
export type CreateRoomCommand = z.output<typeof createRoomSchema>;
export type JoinRoomCommand = z.output<typeof joinRoomSchema>;

/**
 * First human-readable reason a payload was rejected. Used for the
 * `INVALID_PAYLOAD` socket error and for inline form errors on the client.
 */
export function describeZodError(error: z.ZodError, fallback: string): string {
  const [issue] = error.issues;
  return issue?.message ?? fallback;
}
