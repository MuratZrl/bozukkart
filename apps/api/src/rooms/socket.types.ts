import type { ClientToServerEvents, ServerToClientEvents } from '@puncline/shared';
import type { Server, Socket } from 'socket.io';

/** socket.io server typed with the shared protocol. */
export type PunclineServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** A single connection, typed with the shared protocol. */
export type PunclineSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
