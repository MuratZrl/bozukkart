/** Every payload that crosses the socket boundary is described here, once. */

import type { Locale } from './constants';
import type { GameSnapshot } from './game';
import type { MessageKey, TranslationParams } from './i18n';

export interface PlayerSnapshot {
  /**
   * Client-generated player id. Stable across reconnects, so it survives a
   * refresh or a dropped connection; the socket id does not.
   */
  readonly id: string;
  readonly nickname: string;
  readonly isHost: boolean;
  /**
   * False while the player is disconnected but still inside their reconnect
   * grace period. Render these greyed out rather than removing the row.
   */
  readonly connected: boolean;
  readonly score: number;
  /** Epoch milliseconds, used only for stable ordering in the UI. */
  readonly joinedAt: number;
}

export interface RoomSnapshot {
  readonly code: string;
  /** Player id of the host, never a socket id. */
  readonly hostId: string;
  /** Ordered oldest player first; the host is always index 0. */
  readonly players: readonly PlayerSnapshot[];
  readonly maxPlayers: number;
  readonly createdAt: number;
  /** Fixed at creation; the room only ever draws from this locale's deck. */
  readonly locale: Locale;
  readonly targetScore: number;
  readonly game: GameSnapshot;
}

/** Acknowledgement data for a successful create/join. */
export interface RoomMembership {
  readonly room: RoomSnapshot;
  /** Echoes back which player in `room.players` is the caller. */
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

  /** Only the host may start a game or deal the next round. */
  NotHost: 'NOT_HOST',
  /** Only the current judge may pick a winner. */
  NotJudge: 'NOT_JUDGE',
  /** The judge sits the round out. */
  JudgeCannotSubmit: 'JUDGE_CANNOT_SUBMIT',
  /** The action does not exist in the phase the room is in. */
  WrongPhase: 'WRONG_PHASE',
  AlreadySubmitted: 'ALREADY_SUBMITTED',
  /** A submitted card is not actually in the sender's hand. */
  CardNotInHand: 'CARD_NOT_IN_HAND',
  /** Submitted a different number of cards than the prompt asks for. */
  WrongPickCount: 'WRONG_PICK_COUNT',
  DuplicateCards: 'DUPLICATE_CARDS',
  SubmissionNotFound: 'SUBMISSION_NOT_FOUND',
  NotEnoughPlayers: 'NOT_ENOUGH_PLAYERS',
  NoRoundInProgress: 'NO_ROUND_IN_PROGRESS',

  /** Client-side only: the socket was not connected when the call was made. */
  NotConnected: 'NOT_CONNECTED',
  /** Client-side only: no acknowledgement arrived in time. */
  Timeout: 'TIMEOUT',
} as const;

export type SocketErrorCode =
  (typeof SOCKET_ERROR_CODE)[keyof typeof SOCKET_ERROR_CODE];

/**
 * Errors travel as a dictionary key plus params, never as prose. The server has
 * no idea which language the client is showing, and a room's locale is not
 * necessarily the reader's.
 */
export interface SocketError {
  readonly code: SocketErrorCode;
  readonly key: MessageKey;
  readonly params?: TranslationParams;
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
  key: MessageKey,
  params?: TranslationParams,
): SocketResult<TData> {
  return {
    ok: false,
    error: params === undefined ? { code, key } : { code, key, params },
  };
}
