import type { ClientToServerEvents, ServerToClientEvents } from '@bozukkart/shared';
import type { Server, Socket } from 'socket.io';

/** socket.io server typed with the shared protocol. */
export type BozukkartServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** A single connection, typed with the shared protocol. */
export type BozukkartSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
