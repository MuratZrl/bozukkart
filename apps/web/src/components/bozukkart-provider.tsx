'use client';

import {
  CREATE_ROOM,
  DEFAULT_LOCALE,
  HAND_STATE,
  JOIN_ROOM,
  LEAVE_ROOM,
  NEXT_ROUND,
  PICK_WINNER,
  ROOM_STATE,
  SOCKET_ERROR_CODE,
  START_GAME,
  SUBMIT_CARDS,
  socketFail,
  translate,
  type GameActionResult,
  type HandSnapshot,
  type Locale,
  type MessageKey,
  type RoomDeparture,
  type RoomMembership,
  type RoomSnapshot,
  type SocketAck,
  type SocketError,
  type SocketErrorCode,
  type SocketResult,
  type TranslationParams,
} from '@bozukkart/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ROOM_CREATION_LOCALE,
  detectLocale,
  readStoredLocale,
  storeLocale,
} from '@/lib/locale';
import { getPlayerId } from '@/lib/player-id';
import {
  clearRoomSession,
  readRoomSession,
  storeRoomSession,
} from '@/lib/room-session';
import { getSocket } from '@/lib/socket';

/** How long to wait for a server acknowledgement before giving up. */
const ACK_TIMEOUT_MS = 8_000;

/**
 * Backoff between automatic rejoin attempts, in order. Anything past the end of
 * the list repeats `REJOIN_RETRY_MAX_DELAY_MS`.
 */
const REJOIN_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;
const REJOIN_RETRY_MAX_DELAY_MS = 8_000;

/**
 * How long a tab keeps trying to claim its seat back before it gives up and
 * falls through to the join form. Deliberately longer than the server's
 * reconnect grace period: past that the seat itself is gone, but landing back
 * in the right room without a hand still beats being dumped on the form.
 */
const REJOIN_RETRY_WINDOW_MS = 60_000;

/**
 * Failures that mean the seat is definitively not coming back, so retrying
 * would only earn the same answer. Everything else — an acknowledgement that
 * never arrived, an API that is up but not answering properly yet — is
 * transient and worth another go.
 *
 * The set is deliberately a whitelist of terminal codes rather than a list of
 * transient ones: a code added later defaults to being retried instead of to
 * silently destroying the session, which is the failure this whole path exists
 * to avoid.
 *
 * ROOM_NOT_FOUND is terminal here even though the server currently returns it
 * for two very different things: a room that genuinely never existed, and one
 * that was lost when the API restarted. The client cannot tell those apart from
 * the code alone, so a restart still drops players back to the join form.
 * Making the server answer the second case distinguishably is a later pass;
 * when it does, that new code belongs on the transient side and this entry
 * stays for the genuinely-never-existed case.
 */
const TERMINAL_REJOIN_CODES: ReadonlySet<SocketErrorCode> = new Set([
  SOCKET_ERROR_CODE.InvalidPayload,
  SOCKET_ERROR_CODE.RoomNotFound,
  SOCKET_ERROR_CODE.RoomFull,
  SOCKET_ERROR_CODE.NicknameTaken,
  SOCKET_ERROR_CODE.AlreadyInRoom,
]);

function isTerminalRejoinError(error: SocketError): boolean {
  return TERMINAL_REJOIN_CODES.has(error.code);
}

/** Renders a dictionary key in the locale currently on screen. */
export type Translate = (key: MessageKey, params?: TranslationParams) => string;

export interface BozukkartContextValue {
  /** Whether the socket is currently connected to the API. */
  readonly connected: boolean;
  /** Latest snapshot of the room this tab is in, or `null` when not in one. */
  readonly room: RoomSnapshot | null;
  /** This tab's private hand. Never part of the room snapshot. */
  readonly hand: HandSnapshot | null;
  /** Which player in `room.players` is this tab. */
  readonly playerId: string | null;
  /** The room's locale while in one, otherwise this browser's preference. */
  readonly locale: Locale;
  setLocale: (locale: Locale) => void;
  /**
   * True while this tab is trying to get its seat back on its own. The lobby
   * shows a connecting state instead of the rejoin form for as long as it is.
   */
  readonly rejoining: boolean;
  /** Why the last automatic rejoin was refused, if it was. */
  readonly rejoinError: SocketError | null;
  createRoom: (nickname: string) => Promise<SocketResult<RoomMembership>>;
  joinRoom: (
    code: string,
    nickname: string,
  ) => Promise<SocketResult<RoomMembership>>;
  leaveRoom: () => Promise<SocketResult<RoomDeparture>>;
  startGame: () => Promise<SocketResult<GameActionResult>>;
  nextRound: () => Promise<SocketResult<GameActionResult>>;
  submitCards: (
    cardIds: readonly string[],
  ) => Promise<SocketResult<GameActionResult>>;
  pickWinner: (
    submissionId: string,
  ) => Promise<SocketResult<GameActionResult>>;
}

const BozukkartContext = createContext<BozukkartContextValue | null>(null);

export function useBozukkart(): BozukkartContextValue {
  const value = useContext(BozukkartContext);
  if (value === null) {
    throw new Error('useBozukkart must be used inside <BozukkartProvider>.');
  }

  return value;
}

/** Bound to whatever locale is on screen right now. */
export function useTranslate(): Translate {
  const { locale } = useBozukkart();

  return useCallback(
    (key: MessageKey, params?: TranslationParams) =>
      translate(locale, key, params),
    [locale],
  );
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
      resolve(socketFail<TData>(SOCKET_ERROR_CODE.Timeout, 'errors.timeout'));
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
    'errors.notConnected',
  );
}

/** The nickname the server settled on, which may be normalised from the input. */
function canonicalNickname(membership: RoomMembership, fallback: string): string {
  const self = membership.room.players.find(
    (player) => player.id === membership.playerId,
  );

  return self?.nickname ?? fallback;
}

export function BozukkartProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [hand, setHand] = useState<HandSnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [rejoining, setRejoining] = useState(false);
  const [rejoinError, setRejoinError] = useState<SocketError | null>(null);
  const [uiLocale, setUiLocale] = useState<Locale>(DEFAULT_LOCALE);

  /** Lets the connect handler check the current room without re-subscribing. */
  const roomCodeRef = useRef<string | null>(null);
  /**
   * Kept in sync so a create can read the current preference without a stale
   * closure. Unused while room creation is pinned to ROOM_CREATION_LOCALE, and
   * the hook a restored language picker would use again.
   */
  const localeRef = useRef<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    roomCodeRef.current = room?.code ?? null;
  }, [room]);

  // Storage and navigator are client-only, so the first paint uses the default
  // and this corrects it immediately after hydration.
  useEffect(() => {
    const preferred = readStoredLocale() ?? detectLocale();
    setUiLocale(preferred);
    localeRef.current = preferred;
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setUiLocale(next);
    localeRef.current = next;
    storeLocale(next);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    let rejoinInFlight = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    /** Attempts already refused in the current window, which picks the backoff. */
    let retryCount = 0;
    /** When the current window opened, so the cap is on elapsed time, not tries. */
    let retryWindowStartedAt = 0;

    const cancelRetry = (): void => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    /** A fresh connection is a fresh chance at the seat, so the window restarts. */
    const openRetryWindow = (): void => {
      cancelRetry();
      retryCount = 0;
      retryWindowStartedAt = Date.now();
    };

    /**
     * Give up on the seat for good: drop the session so nothing tries again,
     * and let the lobby fall back to the form with the reason.
     */
    const abandonSeat = (error: SocketError): void => {
      cancelRetry();
      retryCount = 0;
      clearRoomSession();
      setRejoinError(error);
      setRejoining(false);
    };

    /**
     * Queue another attempt, unless the window has no room left for one. The
     * session and the rejoining panel both survive until it does run out, so
     * the retries are invisible to the player.
     */
    const queueRetry = (error: SocketError): void => {
      const delay =
        REJOIN_RETRY_DELAYS_MS[retryCount] ?? REJOIN_RETRY_MAX_DELAY_MS;
      retryCount += 1;

      if (Date.now() + delay - retryWindowStartedAt > REJOIN_RETRY_WINDOW_MS) {
        abandonSeat(error);
        return;
      }

      cancelRetry();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void attemptRejoin();
      }, delay);
    };

    /**
     * Claim the seat this tab already had. Runs on every connect, including the
     * first one after a reload, so a refresh looks like a blip rather than a
     * trip back through the join form. A refusal only ends it when the server
     * says the seat is definitively gone; anything else is retried until the
     * window closes.
     */
    const attemptRejoin = async (): Promise<void> => {
      if (rejoinInFlight) {
        return;
      }

      const session = readRoomSession();
      if (session === null || roomCodeRef.current === session.code) {
        cancelRetry();
        retryCount = 0;
        setRejoining(false);
        return;
      }

      // Nothing to retry against while the transport is down, and reconnecting
      // starts a fresh window anyway. socket.io keeps trying in the meantime.
      if (!socket.connected) {
        return;
      }

      rejoinInFlight = true;
      setRejoining(true);
      setRejoinError(null);

      try {
        const result = await request<RoomMembership>((ack) => {
          socket.emit(
            JOIN_ROOM,
            {
              playerId: getPlayerId(),
              code: session.code,
              nickname: session.nickname,
            },
            ack,
          );
        });

        if (result.ok) {
          cancelRetry();
          retryCount = 0;
          setRoom(result.data.room);
          setPlayerId(result.data.playerId);
          setRejoining(false);
          storeRoomSession({
            code: result.data.room.code,
            nickname: canonicalNickname(result.data, session.nickname),
          });
        } else if (isTerminalRejoinError(result.error)) {
          abandonSeat(result.error);
        } else {
          queueRetry(result.error);
        }
      } finally {
        rejoinInFlight = false;
      }
    };

    const handleConnect = (): void => {
      setConnected(true);
      openRetryWindow();
      void attemptRejoin();
    };

    const handleDisconnect = (): void => {
      // The seat survives on the server for the grace period, but this tab stops
      // hearing about it, so the snapshot in hand is already stale. Show the
      // connecting state straight away rather than flashing the join form.
      // Any pending retry goes with the connection; reconnecting queues its own.
      cancelRetry();
      setConnected(false);
      setRoom(null);
      setHand(null);
      setPlayerId(null);
      setRejoining(readRoomSession() !== null);
    };

    const handleRoomState = (snapshot: RoomSnapshot): void => {
      setRoom(snapshot);
    };

    const handleHandState = (snapshot: HandSnapshot): void => {
      setHand(snapshot);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on(ROOM_STATE, handleRoomState);
    socket.on(HAND_STATE, handleHandState);

    if (socket.connected) {
      setConnected(true);
      // Mounting onto an already-open socket gets no 'connect' event, so the
      // window has to be opened by hand here.
      openRetryWindow();
      void attemptRejoin();
    } else {
      setRejoining(readRoomSession() !== null);
      socket.connect();
    }

    return () => {
      cancelRetry();
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off(ROOM_STATE, handleRoomState);
      socket.off(HAND_STATE, handleHandState);
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
        socket.emit(
          CREATE_ROOM,
          {
            playerId: getPlayerId(),
            nickname,
            // Fixed while the English deck is a placeholder; the field itself
            // is untouched and the server still validates it.
            locale: ROOM_CREATION_LOCALE,
          },
          ack,
        );
      });

      if (result.ok) {
        setRoom(result.data.room);
        setPlayerId(result.data.playerId);
        setRejoinError(null);
        storeRoomSession({
          code: result.data.room.code,
          nickname: canonicalNickname(result.data, nickname),
        });
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
        socket.emit(JOIN_ROOM, { playerId: getPlayerId(), code, nickname }, ack);
      });

      if (result.ok) {
        setRoom(result.data.room);
        setPlayerId(result.data.playerId);
        setRejoinError(null);
        storeRoomSession({
          code: result.data.room.code,
          nickname: canonicalNickname(result.data, nickname),
        });
      }

      return result;
    },
    [],
  );

  const leaveRoom = useCallback(async (): Promise<
    SocketResult<RoomDeparture>
  > => {
    const socket = getSocket();

    // Leaving is deliberate, so this tab must not try to crawl back in later.
    clearRoomSession();
    setRejoining(false);
    setRejoinError(null);

    if (!socket.connected) {
      // Nothing to tell the server about: it drops us on disconnect anyway.
      setRoom(null);
      setHand(null);
      setPlayerId(null);
      return notConnected<RoomDeparture>();
    }

    const result = await request<RoomDeparture>((ack) => {
      socket.emit(LEAVE_ROOM, ack);
    });

    setRoom(null);
    setHand(null);
    setPlayerId(null);

    return result;
  }, []);

  const startGame = useCallback(async (): Promise<
    SocketResult<GameActionResult>
  > => {
    const socket = getSocket();
    if (!socket.connected) {
      return notConnected<GameActionResult>();
    }

    return request<GameActionResult>((ack) => {
      socket.emit(START_GAME, ack);
    });
  }, []);

  const nextRound = useCallback(async (): Promise<
    SocketResult<GameActionResult>
  > => {
    const socket = getSocket();
    if (!socket.connected) {
      return notConnected<GameActionResult>();
    }

    return request<GameActionResult>((ack) => {
      socket.emit(NEXT_ROUND, ack);
    });
  }, []);

  const submitCards = useCallback(
    async (
      cardIds: readonly string[],
    ): Promise<SocketResult<GameActionResult>> => {
      const socket = getSocket();
      if (!socket.connected) {
        return notConnected<GameActionResult>();
      }

      return request<GameActionResult>((ack) => {
        socket.emit(SUBMIT_CARDS, { cardIds: [...cardIds] }, ack);
      });
    },
    [],
  );

  const pickWinner = useCallback(
    async (submissionId: string): Promise<SocketResult<GameActionResult>> => {
      const socket = getSocket();
      if (!socket.connected) {
        return notConnected<GameActionResult>();
      }

      return request<GameActionResult>((ack) => {
        socket.emit(PICK_WINNER, { submissionId }, ack);
      });
    },
    [],
  );

  // A room's own locale wins over this browser's preference: everyone in a
  // Turkish room reads the same cards.
  const locale = room?.locale ?? uiLocale;

  // Casing rules are language-specific, and the UI upper-cases a lot of type.
  // Left on the server-rendered default, an English room renders "IS" as "İS"
  // under Turkish rules.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<BozukkartContextValue>(
    () => ({
      connected,
      room,
      hand,
      playerId,
      locale,
      setLocale,
      rejoining,
      rejoinError,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      nextRound,
      submitCards,
      pickWinner,
    }),
    [
      connected,
      room,
      hand,
      playerId,
      locale,
      setLocale,
      rejoining,
      rejoinError,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      nextRound,
      submitCards,
      pickWinner,
    ],
  );

  return (
    <BozukkartContext.Provider value={value}>
      {children}
    </BozukkartContext.Provider>
  );
}
