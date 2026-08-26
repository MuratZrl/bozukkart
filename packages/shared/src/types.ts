/** Every payload that crosses the socket boundary is described here, once. */

export interface PlayerSnapshot {
  /** Socket id of the connection that owns this player for the current session. */
  readonly id: string;
  readonly nickname: string;
  readonly isHost: boolean;
  /** Epoch milliseconds, used only for stable ordering in the UI. */
  readonly joinedAt: number;
}

export interface RoomSnapshot {
  readonly code: string;
  readonly hostId: string;
  /** Ordered oldest player first; the host is always index 0. */
  readonly players: readonly PlayerSnapshot[];
  readonly maxPlayers: number;
  readonly createdAt: number;
}

/** Acknowledgement data for a successful create/join. */
export interface RoomMembership {
  readonly room: RoomSnapshot;
  /** Which player in `room.players` is the caller. */
  readonly playerId: string;
}

/** Acknowledgement data for a successful leave. */
export interface RoomDeparture {
  readonly code: string;
  /** True when the caller was the last player and the room was destroyed. */
  readonly roomClosed: boolean;
}

export const SOCKET_ERROR_CODE = {
  /** Payload failed server-side zod validation. */
  InvalidPayload: 'INVALID_PAYLOAD',
  RoomNotFound: 'ROOM_NOT_FOUND',
  RoomFull: 'ROOM_FULL',
  NicknameTaken: 'NICKNAME_TAKEN',
  AlreadyInRoom: 'ALREADY_IN_ROOM',
  NotInRoom: 'NOT_IN_ROOM',
  /** Every generated code collided; the server refused to keep guessing. */
  RoomCodeUnavailable: 'ROOM_CODE_UNAVAILABLE',
  Internal: 'INTERNAL_ERROR',
  /** Client-side only: the socket was not connected when the call was made. */
  NotConnected: 'NOT_CONNECTED',
  /** Client-side only: no acknowledgement arrived in time. */
  Timeout: 'TIMEOUT',
} as const;

export type SocketErrorCode =
  (typeof SOCKET_ERROR_CODE)[keyof typeof SOCKET_ERROR_CODE];

export interface SocketError {
  readonly code: SocketErrorCode;
  /** Safe to render: never contains stack traces or internal detail. */
  readonly message: string;
}

export type SocketResult<TData> =
  | { readonly ok: true; readonly data: TData }
  | { readonly ok: false; readonly error: SocketError };

export type SocketAck<TData> = (result: SocketResult<TData>) => void;

export function socketOk<TData>(data: TData): SocketResult<TData> {
  return { ok: true, data };
}

export function socketFail<TData = never>(
  code: SocketErrorCode,
  message: string,
): SocketResult<TData> {
  return { ok: false, error: { code, message } };
}
