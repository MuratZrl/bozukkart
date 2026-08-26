import type { CreateRoomPayload, JoinRoomPayload } from './schemas';
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
export const ROOM_STATE = 'room:state';

export const CLIENT_EVENTS = {
  CREATE_ROOM,
  JOIN_ROOM,
  LEAVE_ROOM,
} as const;

export const SERVER_EVENTS = {
  ROOM_STATE,
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
}

/** Server -> client. Broadcast to everyone in a room on any membership change. */
export interface ServerToClientEvents {
  [ROOM_STATE]: (room: RoomSnapshot) => void;
}
