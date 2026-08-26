'use client';

import {
  CREATE_ROOM,
  JOIN_ROOM,
  LEAVE_ROOM,
  ROOM_STATE,
  SOCKET_ERROR_CODE,
  socketFail,
  type RoomDeparture,
  type RoomMembership,
  type RoomSnapshot,
  type SocketAck,
  type SocketResult,
} from '@puncline/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getSocket } from '@/lib/socket';

/** How long to wait for a server acknowledgement before giving up. */
const ACK_TIMEOUT_MS = 8_000;

export interface PunclineContextValue {
  /** Whether the socket is currently connected to the API. */
  readonly connected: boolean;
  /** Latest snapshot of the room this tab is in, or `null` when not in one. */
  readonly room: RoomSnapshot | null;
  /** Which player in `room.players` is this tab. */
  readonly playerId: string | null;
  createRoom: (nickname: string) => Promise<SocketResult<RoomMembership>>;
  joinRoom: (
    code: string,
    nickname: string,
  ) => Promise<SocketResult<RoomMembership>>;
  leaveRoom: () => Promise<SocketResult<RoomDeparture>>;
}

const PunclineContext = createContext<PunclineContextValue | null>(null);

export function usePuncline(): PunclineContextValue {
  const value = useContext(PunclineContext);
  if (value === null) {
    throw new Error('usePuncline must be used inside <PunclineProvider>.');
  }

  return value;
}

/**
 * Wraps an emit in a promise that always resolves to a `SocketResult`, so callers
 * never have to deal with a hanging acknowledgement.
 */
function request<TData>(
  send: (ack: SocketAck<TData>) => void,
): Promise<SocketResult<TData>> {
  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(
        socketFail<TData>(
          SOCKET_ERROR_CODE.Timeout,
          'The server did not answer. Is the API running on port 3001?',
        ),
      );
    }, ACK_TIMEOUT_MS);

    send((result) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function notConnected<TData>(): SocketResult<TData> {
  return socketFail<TData>(
    SOCKET_ERROR_CODE.NotConnected,
    'Not connected to the server yet.',
  );
}

export function PunclineProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = (): void => {
      setConnected(true);
    };

    const handleDisconnect = (): void => {
      // A reconnect gets a fresh socket id, so the server no longer knows this
      // player. Drop the membership and let the lobby ask them to rejoin.
      setConnected(false);
      setRoom(null);
      setPlayerId(null);
    };

    const handleRoomState = (snapshot: RoomSnapshot): void => {
      setRoom(snapshot);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on(ROOM_STATE, handleRoomState);

    if (socket.connected) {
      setConnected(true);
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off(ROOM_STATE, handleRoomState);
      // The socket itself is a tab-lifetime singleton and stays connected, which
      // also keeps React strict mode's double-mount from churning connections.
    };
  }, []);

  const createRoom = useCallback(
    async (nickname: string): Promise<SocketResult<RoomMembership>> => {
      const socket = getSocket();
      if (!socket.connected) {
        return notConnected<RoomMembership>();
      }

      const result = await request<RoomMembership>((ack) => {
        socket.emit(CREATE_ROOM, { nickname }, ack);
      });

      if (result.ok) {
        setRoom(result.data.room);
        setPlayerId(result.data.playerId);
      }

      return result;
    },
    [],
  );

  const joinRoom = useCallback(
    async (
      code: string,
      nickname: string,
    ): Promise<SocketResult<RoomMembership>> => {
      const socket = getSocket();
      if (!socket.connected) {
        return notConnected<RoomMembership>();
      }

      const result = await request<RoomMembership>((ack) => {
        socket.emit(JOIN_ROOM, { code, nickname }, ack);
      });

      if (result.ok) {
        setRoom(result.data.room);
        setPlayerId(result.data.playerId);
      }

      return result;
    },
    [],
  );

  const leaveRoom = useCallback(async (): Promise<
    SocketResult<RoomDeparture>
  > => {
    const socket = getSocket();
    if (!socket.connected) {
      // Nothing to tell the server about: it drops us on disconnect anyway.
      setRoom(null);
      setPlayerId(null);
      return notConnected<RoomDeparture>();
    }

    const result = await request<RoomDeparture>((ack) => {
      socket.emit(LEAVE_ROOM, ack);
    });

    setRoom(null);
    setPlayerId(null);

    return result;
  }, []);

  const value = useMemo<PunclineContextValue>(
    () => ({ connected, room, playerId, createRoom, joinRoom, leaveRoom }),
    [connected, room, playerId, createRoom, joinRoom, leaveRoom],
  );

  return (
    <PunclineContext.Provider value={value}>{children}</PunclineContext.Provider>
  );
}
