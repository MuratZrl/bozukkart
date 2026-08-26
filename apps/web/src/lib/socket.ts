import type { ClientToServerEvents, ServerToClientEvents } from '@bozukkart/shared';
import { io, type Socket } from 'socket.io-client';

/** Note the generic order: the client listens for server events and emits client events. */
export type BozukkartClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

let instance: BozukkartClientSocket | null = null;

/**
 * One socket per tab, created lazily so nothing is constructed during SSR.
 * `autoConnect` is off; the provider owns the connection lifecycle.
 */
export function getSocket(): BozukkartClientSocket {
  if (instance === null) {
    instance = io(API_URL, {
      autoConnect: false,
      withCredentials: true,
    });
  }

  return instance;
}
