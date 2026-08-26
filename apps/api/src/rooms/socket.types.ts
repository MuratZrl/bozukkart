import type { ClientToServerEvents, ServerToClientEvents } from '@punchline/shared';
import type { Server, Socket } from 'socket.io';

/** socket.io server typed with the shared protocol. */
export type PunchlineServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** A single connection, typed with the shared protocol. */
export type PunchlineSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
