import type { GameActionResult, HandSnapshot } from './game';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  PickWinnerPayload,
  SubmitCardsPayload,
} from './schemas';
import type {
  RoomDeparture,
  RoomMembership,
  RoomSnapshot,
  SocketAck,
} from './types';

/**
 * Socket event names. These consts are the only place a wire event name exists;
 * the gateway and the client both reference them by identifier, so a rename is a
 * compile error instead of a silent protocol break.
 */
export const CREATE_ROOM = 'room:create';
export const JOIN_ROOM = 'room:join';
export const LEAVE_ROOM = 'room:leave';
export const START_GAME = 'game:start';
export const SUBMIT_CARDS = 'game:submit';
export const PICK_WINNER = 'game:pick-winner';
export const NEXT_ROUND = 'game:next-round';

export const ROOM_STATE = 'room:state';
export const HAND_STATE = 'hand:state';

export const CLIENT_EVENTS = {
  CREATE_ROOM,
  JOIN_ROOM,
  LEAVE_ROOM,
  START_GAME,
  SUBMIT_CARDS,
  PICK_WINNER,
  NEXT_ROUND,
} as const;

export const SERVER_EVENTS = {
  ROOM_STATE,
  HAND_STATE,
} as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

/** Client -> server. Every call is acknowledged with a `SocketResult`. */
export interface ClientToServerEvents {
  [CREATE_ROOM]: (
    payload: CreateRoomPayload,
    ack: SocketAck<RoomMembership>,
  ) => void;
  [JOIN_ROOM]: (
    payload: JoinRoomPayload,
    ack: SocketAck<RoomMembership>,
  ) => void;
  [LEAVE_ROOM]: (ack: SocketAck<RoomDeparture>) => void;
  [START_GAME]: (ack: SocketAck<GameActionResult>) => void;
  [SUBMIT_CARDS]: (
    payload: SubmitCardsPayload,
    ack: SocketAck<GameActionResult>,
  ) => void;
  [PICK_WINNER]: (
    payload: PickWinnerPayload,
    ack: SocketAck<GameActionResult>,
  ) => void;
  [NEXT_ROUND]: (ack: SocketAck<GameActionResult>) => void;
}

/**
 * Server -> client. `room:state` is broadcast to everyone in the room on any
 * change; `hand:state` goes to one socket and never leaves it.
 */
export interface ServerToClientEvents {
  [ROOM_STATE]: (room: RoomSnapshot) => void;
  [HAND_STATE]: (hand: HandSnapshot) => void;
}
