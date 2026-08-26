import { randomInt } from 'node:crypto';

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  MAX_PLAYERS_PER_ROOM,
  RECONNECT_GRACE_PERIOD_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SOCKET_ERROR_CODE,
  type PlayerSnapshot,
  type RoomSnapshot,
} from '@punchline/shared';

import { RoomError } from './room.error';
import type {
  PlayerRecord,
  RoomEntryResult,
  RoomRecord,
  RoomUpdate,
  RoomUpdateListener,
} from './rooms.types';

/** Give up rather than spin forever once the code space is saturated. */
const MAX_CODE_GENERATION_ATTEMPTS = 32;

/**
 * In-memory room registry. Deliberately not persisted: a room only exists while
 * at least one player holds a seat in it, so a restart wipes the slate.
 *
 * Players are keyed by their client-generated player id, never by socket id. A
 * dropped connection leaves the seat in place behind a grace timer, so a
 * refresh or a flaky tunnel does not cost anyone their spot or the host badge.
 */
@Injectable()
export class RoomsService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomsService.name);

  /** code -> room */
  private readonly rooms = new Map<string, RoomRecord>();

  /** player id -> room code */
  private readonly roomCodeByPlayerId = new Map<string, string>();

  /** socket id -> player id, so a disconnect resolves in O(1). */
  private readonly playerIdBySocketId = new Map<string, string>();

  private readonly updateListeners = new Set<RoomUpdateListener>();

  /**
   * Grace expiries fire on a timer with no socket call to answer, so the
   * gateway subscribes here to broadcast whatever they change.
   */
  onRoomUpdate(listener: RoomUpdateListener): void {
    this.updateListeners.add(listener);
  }

  onModuleDestroy(): void {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        clearGraceTimer(player);
      }
    }

    this.rooms.clear();
    this.roomCodeByPlayerId.clear();
    this.playerIdBySocketId.clear();
    this.updateListeners.clear();
  }

  createRoom(
    playerId: string,
    socketId: string,
    nickname: string,
  ): RoomEntryResult {
    const vacatedRoom = this.releasePreviousSeat(playerId, null);

    const code = this.generateRoomCode();
    const now = Date.now();
    const host: PlayerRecord = {
      id: playerId,
      socketId,
      nickname,
      joinedAt: now,
      connected: true,
      graceTimer: null,
    };
    const room: RoomRecord = {
      code,
      hostId: playerId,
      createdAt: now,
      players: new Map([[playerId, host]]),
    };

    this.rooms.set(code, room);
    this.indexPlayer(playerId, socketId, code);
    this.logger.log(`Room ${code} created by ${nickname} (${playerId})`);

    return {
      membership: { room: toRoomSnapshot(room), playerId },
      vacatedRoom,
      displacedSocketId: null,
      reattached: false,
    };
  }

  /**
   * Fresh join, or reattach when this player already holds a seat here. A
   * reattach covers both a reconnect inside the grace period and a second tab
   * taking over from a socket that is somehow still open.
   */
  joinRoom(
    playerId: string,
    socketId: string,
    code: string,
    nickname: string,
  ): RoomEntryResult {
    const room = this.rooms.get(code);
    if (room === undefined) {
      throw new RoomError(
        SOCKET_ERROR_CODE.RoomNotFound,
        `No room with code ${code}.`,
      );
    }

    const existing = room.players.get(playerId);
    if (existing !== undefined) {
      return this.reattach(room, existing, socketId, nickname);
    }

    const vacatedRoom = this.releasePreviousSeat(playerId, code);

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      throw new RoomError(
        SOCKET_ERROR_CODE.RoomFull,
        `Room ${code} is full (${MAX_PLAYERS_PER_ROOM} players max).`,
      );
    }

    this.assertNicknameAvailable(room, nickname, null);

    const player: PlayerRecord = {
      id: playerId,
      socketId,
      nickname,
      joinedAt: Date.now(),
      connected: true,
      graceTimer: null,
    };
    room.players.set(playerId, player);
    this.indexPlayer(playerId, socketId, code);
    this.logger.log(`${nickname} (${playerId}) joined room ${code}`);

    return {
      membership: { room: toRoomSnapshot(room), playerId },
      vacatedRoom,
      displacedSocketId: null,
      reattached: false,
    };
  }

  /**
   * Explicit departure. Unlike a disconnect this is final: the player asked to
   * go, so there is nothing to hold a seat for.
   */
  leaveRoom(socketId: string): RoomUpdate | null {
    const playerId = this.playerIdBySocketId.get(socketId);
    if (playerId === undefined) {
      return null;
    }

    const room = this.findRoomOfPlayer(playerId);
    if (room === null) {
      this.playerIdBySocketId.delete(socketId);
      return null;
    }

    const player = room.players.get(playerId);
    this.logger.log(
      `${player?.nickname ?? playerId} left room ${room.code} deliberately`,
    );

    return this.removePlayer(room, playerId);
  }

  /**
   * A socket dropped. The seat stays, marked disconnected, until the grace
   * timer expires; everyone else is told so the lobby can grey the player out.
   */
  markDisconnected(socketId: string): RoomUpdate | null {
    const playerId = this.playerIdBySocketId.get(socketId);
    if (playerId === undefined) {
      return null;
    }

    this.playerIdBySocketId.delete(socketId);

    const room = this.findRoomOfPlayer(playerId);
    if (room === null) {
      return null;
    }

    const player = room.players.get(playerId);
    if (player === undefined) {
      return null;
    }

    // A newer socket already took this player over, so this disconnect belongs
    // to the socket that was displaced and means nothing.
    if (player.socketId !== socketId) {
      return null;
    }

    player.socketId = null;
    player.connected = false;
    this.scheduleGraceExpiry(room.code, player);
    this.logger.log(
      `${player.nickname} dropped out of room ${room.code}, holding their seat for ${RECONNECT_GRACE_PERIOD_MS}ms`,
    );

    return {
      code: room.code,
      room: toRoomSnapshot(room),
      roomClosed: false,
      promotedHostId: null,
    };
  }

  /** Read-only view, mostly for diagnostics. */
  getRoom(code: string): RoomSnapshot | null {
    const room = this.rooms.get(code);
    return room === undefined ? null : toRoomSnapshot(room);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private reattach(
    room: RoomRecord,
    player: PlayerRecord,
    socketId: string,
    nickname: string,
  ): RoomEntryResult {
    // The player's own record must not block their own nickname.
    this.assertNicknameAvailable(room, nickname, player.id);

    const displacedSocketId =
      player.socketId !== null && player.socketId !== socketId
        ? player.socketId
        : null;

    clearGraceTimer(player);

    if (player.socketId !== null) {
      this.playerIdBySocketId.delete(player.socketId);
    }

    player.socketId = socketId;
    player.nickname = nickname;
    player.connected = true;
    this.indexPlayer(player.id, socketId, room.code);

    this.logger.log(
      `${nickname} reattached to room ${room.code}${
        room.hostId === player.id ? ' as host' : ''
      }`,
    );

    return {
      membership: { room: toRoomSnapshot(room), playerId: player.id },
      vacatedRoom: null,
      displacedSocketId,
      reattached: true,
    };
  }

  /**
   * One seat per player. A seat they are actively connected to blocks the new
   * one; a seat they are merely lingering in behind a grace timer is dropped.
   */
  private releasePreviousSeat(
    playerId: string,
    targetCode: string | null,
  ): RoomUpdate | null {
    const previousCode = this.roomCodeByPlayerId.get(playerId);
    if (previousCode === undefined || previousCode === targetCode) {
      return null;
    }

    const room = this.rooms.get(previousCode);
    if (room === undefined) {
      this.roomCodeByPlayerId.delete(playerId);
      return null;
    }

    const player = room.players.get(playerId);
    if (player !== undefined && player.connected) {
      throw new RoomError(
        SOCKET_ERROR_CODE.AlreadyInRoom,
        `You are already in room ${previousCode}. Leave it first.`,
      );
    }

    this.logger.log(
      `Dropping ${playerId}'s abandoned seat in room ${previousCode}`,
    );

    return this.removePlayer(room, playerId);
  }

  /** Removes a player for good, promoting or closing as needed. */
  private removePlayer(room: RoomRecord, playerId: string): RoomUpdate {
    const player = room.players.get(playerId);
    if (player !== undefined) {
      clearGraceTimer(player);
      if (player.socketId !== null) {
        this.playerIdBySocketId.delete(player.socketId);
      }
    }

    room.players.delete(playerId);
    this.roomCodeByPlayerId.delete(playerId);

    if (room.players.size === 0) {
      this.destroyRoom(room);
      this.logger.log(`Room ${room.code} closed (last player gone)`);

      return {
        code: room.code,
        room: null,
        roomClosed: true,
        promotedHostId: null,
      };
    }

    let promotedHostId: string | null = null;
    if (room.hostId === playerId) {
      const candidates = [...room.players.values()];
      // Prefer someone actually on the line over another player in grace.
      const nextHost =
        candidates.find((candidate) => candidate.connected) ?? candidates[0];

      if (nextHost !== undefined) {
        room.hostId = nextHost.id;
        promotedHostId = nextHost.id;
        this.logger.log(
          `Room ${room.code}: host gone, promoted ${nextHost.nickname}`,
        );
      }
    }

    return {
      code: room.code,
      room: toRoomSnapshot(room),
      roomClosed: false,
      promotedHostId,
    };
  }

  /** Tears a room down, leaving no timer or index entry behind. */
  private destroyRoom(room: RoomRecord): void {
    for (const player of room.players.values()) {
      clearGraceTimer(player);
      if (player.socketId !== null) {
        this.playerIdBySocketId.delete(player.socketId);
      }
      this.roomCodeByPlayerId.delete(player.id);
    }

    room.players.clear();
    this.rooms.delete(room.code);
  }

  private scheduleGraceExpiry(code: string, player: PlayerRecord): void {
    clearGraceTimer(player);

    const timer = setTimeout(() => {
      this.expireGrace(code, player.id);
    }, RECONNECT_GRACE_PERIOD_MS);

    // A pending grace timer must never hold the process open on shutdown.
    timer.unref();
    player.graceTimer = timer;
  }

  private expireGrace(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    if (room === undefined) {
      return;
    }

    const player = room.players.get(playerId);
    if (player === undefined || player.connected) {
      return;
    }

    player.graceTimer = null;
    this.logger.log(
      `${player.nickname} did not come back to room ${code}, giving up their seat`,
    );

    const update = this.removePlayer(room, playerId);
    for (const listener of this.updateListeners) {
      listener(update);
    }
  }

  private assertNicknameAvailable(
    room: RoomRecord,
    nickname: string,
    exceptPlayerId: string | null,
  ): void {
    const candidate = nickname.toLocaleLowerCase();

    for (const player of room.players.values()) {
      if (player.id === exceptPlayerId) {
        continue;
      }

      if (player.nickname.toLocaleLowerCase() === candidate) {
        throw new RoomError(
          SOCKET_ERROR_CODE.NicknameTaken,
          `Someone in room ${room.code} is already called "${nickname}".`,
        );
      }
    }
  }

  private indexPlayer(playerId: string, socketId: string, code: string): void {
    this.roomCodeByPlayerId.set(playerId, code);
    this.playerIdBySocketId.set(socketId, playerId);
  }

  private findRoomOfPlayer(playerId: string): RoomRecord | null {
    const code = this.roomCodeByPlayerId.get(playerId);
    if (code === undefined) {
      return null;
    }

    const room = this.rooms.get(code);
    if (room === undefined) {
      this.roomCodeByPlayerId.delete(playerId);
      return null;
    }

    return room;
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
      let code = '';
      for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length));
      }

      if (!this.rooms.has(code)) {
        return code;
      }
    }

    throw new RoomError(
      SOCKET_ERROR_CODE.RoomCodeUnavailable,
      'Could not allocate a room code. Try again in a moment.',
    );
  }
}

function clearGraceTimer(player: PlayerRecord): void {
  if (player.graceTimer !== null) {
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
  }
}

function toRoomSnapshot(room: RoomRecord): RoomSnapshot {
  const players: PlayerSnapshot[] = [...room.players.values()]
    .map((player) => ({
      id: player.id,
      nickname: player.nickname,
      isHost: player.id === room.hostId,
      connected: player.connected,
      joinedAt: player.joinedAt,
    }))
    .sort(
      (left, right) =>
        Number(right.isHost) - Number(left.isHost) ||
        left.joinedAt - right.joinedAt,
    );

  return {
    code: room.code,
    hostId: room.hostId,
    players,
    maxPlayers: MAX_PLAYERS_PER_ROOM,
    createdAt: room.createdAt,
  };
}
