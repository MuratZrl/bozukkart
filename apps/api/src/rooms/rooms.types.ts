import type { RoomMembership, RoomSnapshot } from '@bozukkart/shared';

/**
 * Server-side record for a single player. Identity is the client-generated
 * `id`; `socketId` is just the connection that currently speaks for them and
 * changes on every reconnect.
 */
export interface PlayerRecord {
  readonly id: string;
  /** Null while the player is disconnected and inside their grace period. */
  socketId: string | null;
  nickname: string;
  readonly joinedAt: number;
  connected: boolean;
  /** Pending removal for a disconnected player. Always cleared on reattach. */
  graceTimer: NodeJS.Timeout | null;
}

/** Server-side record for a room. Insertion order of `players` is join order. */
export interface RoomRecord {
  readonly code: string;
  /** Player id, not a socket id. */
  hostId: string;
  readonly createdAt: number;
  readonly players: Map<string, PlayerRecord>;
}

/**
 * Something changed about a room and everyone still in it needs to hear about
 * it. Richer than any wire type because the gateway also needs the code to
 * broadcast on and the promotion to log.
 */
export interface RoomUpdate {
  readonly code: string;
  /** Post-change state, or `null` when the room was destroyed. */
  readonly room: RoomSnapshot | null;
  readonly roomClosed: boolean;
  /** Set when the host seat moved to a different player. */
  readonly promotedHostId: string | null;
}

/** Result of a player entering a room, whether fresh, reattached or displaced. */
export interface RoomEntryResult {
  readonly membership: RoomMembership;
  /**
   * State of a different room this player was still holding a seat in. Only
   * ever set when that seat was already dead weight inside a grace period.
   */
  readonly vacatedRoom: RoomUpdate | null;
  /**
   * A previous, still-open socket for this same player. The gateway must pull
   * it out of the room so it stops receiving broadcasts meant for the new one.
   */
  readonly displacedSocketId: string | null;
  /** True when this entry reattached an existing player instead of adding one. */
  readonly reattached: boolean;
}

/** Notified when a room changes with no socket call to acknowledge, i.e. on grace expiry. */
export type RoomUpdateListener = (update: RoomUpdate) => void;
