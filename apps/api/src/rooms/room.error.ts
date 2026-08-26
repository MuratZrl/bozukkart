import type { SocketErrorCode } from '@puncline/shared';

/**
 * A rejection the client is allowed to see. Anything thrown that is not a
 * `RoomError` is treated as a bug and reported as `INTERNAL_ERROR`.
 */
export class RoomError extends Error {
  constructor(
    readonly code: SocketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}
