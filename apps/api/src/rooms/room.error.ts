import type {
  MessageKey,
  SocketErrorCode,
  TranslationParams,
} from '@bozukkart/shared';

/**
 * A rejection the client is allowed to see. Carries a dictionary key rather
 * than a sentence: the server has no idea what language the caller is reading.
 * Anything thrown that is not a `RoomError` is treated as a bug and reported as
 * `INTERNAL_ERROR`.
 */
export class RoomError extends Error {
  constructor(
    readonly code: SocketErrorCode,
    readonly key: MessageKey,
    readonly params?: TranslationParams,
  ) {
    // The Error message is for logs only; nothing user-facing reads it.
    super(key);
    this.name = 'RoomError';
  }
}
