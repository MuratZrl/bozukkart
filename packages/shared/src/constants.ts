/**
 * Protocol-level constants. Both the API and the web client import these; nothing
 * about the wire format may be re-declared in an app.
 */

/** Length of a room code, e.g. "QFTM". */
export const ROOM_CODE_LENGTH = 4;

/**
 * Letters a room code may contain. `I` and `O` are excluded so nobody misreads a
 * code as `1` or `0` while typing it in from someone else's screen.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Anchored pattern a normalised (trimmed, upper-cased) room code must match. */
export const ROOM_CODE_PATTERN = new RegExp(
  `^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`,
);

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 16;

/** Hard cap per room, enforced server-side on join. */
export const MAX_PLAYERS_PER_ROOM = 12;
