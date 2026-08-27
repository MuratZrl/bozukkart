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

/**
 * How long a disconnected player keeps their seat, nickname and host status
 * before the server gives up on them. Long enough to survive a page refresh, a
 * tunnel, or a phone locking its screen.
 */
export const RECONNECT_GRACE_PERIOD_MS = 30_000;

/** Locales the game ships decks and UI strings for. */
export const LOCALES = ['tr', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'tr';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.includes(value as Locale);
}

/** Answer cards a non-judge player is dealt back up to at the start of a round. */
export const HAND_SIZE = 10;

/**
 * Below this many connected players there is nobody to judge and nobody to
 * judge between, so the game waits instead of dealing a round.
 */
export const MIN_PLAYERS_TO_START = 3;

/** Points that end the game, overridable per room at creation. */
export const DEFAULT_TARGET_SCORE = 7;
export const MIN_TARGET_SCORE = 1;
export const MAX_TARGET_SCORE = 20;

/** Most answer cards a single prompt can ask for. */
export const MAX_PICK = 3;

/** The run of underscores a prompt uses to mark a blank. */
export const BLANK_TOKEN = '___';

/**
 * How long each timed phase runs. These are the only definition of the round
 * clock; the server arms its timers from them and sends the resulting deadline
 * to clients, which never invent a duration of their own.
 */
export const SELECTING_DURATION_MS = 60_000;
export const JUDGING_DURATION_MS = 45_000;
export const ROUND_RESULT_DURATION_MS = 6_000;

/**
 * Below this many plays a round cannot be judged, so an expired selecting
 * phase throws the round away and deals a new one instead.
 */
export const MIN_SUBMISSIONS_TO_JUDGE = 2;
