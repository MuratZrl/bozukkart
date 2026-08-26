import type { RoomSnapshot } from '@puncline/shared';

/** Server-side record for a single connected player. */
export interface PlayerRecord {
  readonly id: string;
  readonly nickname: string;
  readonly joinedAt: number;
}

/** Server-side record for a room. Insertion order of `players` is join order. */
export interface RoomRecord {
  readonly code: string;
  hostId: string;
  readonly createdAt: number;
  readonly players: Map<string, PlayerRecord>;
}

/**
 * Result of removing a socket from whatever room it was in. Richer than the
 * `RoomDeparture` wire type because the gateway also needs the snapshot to
 * broadcast and the promotion to log.
 */
export interface RoomLeaveOutcome {
  readonly code: string;
  /** True when the last player left and the room was destroyed. */
  readonly roomClosed: boolean;
  /** Post-departure state, or `null` when the room was closed. */
  readonly room: RoomSnapshot | null;
  /** Set when the departing player was the host and someone was promoted. */
  readonly promotedHostId: string | null;
}
