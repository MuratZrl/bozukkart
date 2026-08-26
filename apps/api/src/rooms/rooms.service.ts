import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import {
  MAX_PLAYERS_PER_ROOM,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SOCKET_ERROR_CODE,
  type PlayerSnapshot,
  type RoomMembership,
  type RoomSnapshot,
} from '@punchline/shared';

import { RoomError } from './room.error';
import type { PlayerRecord, RoomLeaveOutcome, RoomRecord } from './rooms.types';

/** Give up rather than spin forever once the code space is saturated. */
const MAX_CODE_GENERATION_ATTEMPTS = 32;

/**
 * In-memory room registry. Deliberately not persisted: a room only exists while
 * at least one socket is in it, so a restart wipes the slate and that is fine.
 */
@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  /** code -> room */
  private readonly rooms = new Map<string, RoomRecord>();

  /** socket id -> room code, so disconnect is O(1) instead of a scan. */
  private readonly roomCodeBySocketId = new Map<string, string>();

  createRoom(socketId: string, nickname: string): RoomMembership {
    this.assertNotInARoom(socketId);

    const code = this.generateRoomCode();
    const now = Date.now();
    const host: PlayerRecord = { id: socketId, nickname, joinedAt: now };
    const room: RoomRecord = {
      code,
      hostId: socketId,
      createdAt: now,
      players: new Map([[socketId, host]]),
    };

    this.rooms.set(code, room);
    this.roomCodeBySocketId.set(socketId, code);
    this.logger.log(`Room ${code} created by ${nickname} (${socketId})`);

    return { room: toRoomSnapshot(room), playerId: socketId };
  }

  joinRoom(socketId: string, code: string, nickname: string): RoomMembership {
    this.assertNotInARoom(socketId);

    const room = this.rooms.get(code);
    if (room === undefined) {
      throw new RoomError(
        SOCKET_ERROR_CODE.RoomNotFound,
        `No room with code ${code}.`,
      );
    }

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      throw new RoomError(
        SOCKET_ERROR_CODE.RoomFull,
        `Room ${code} is full (${MAX_PLAYERS_PER_ROOM} players max).`,
      );
    }

    if (hasNickname(room, nickname)) {
      throw new RoomError(
        SOCKET_ERROR_CODE.NicknameTaken,
        `Someone in room ${code} is already called "${nickname}".`,
      );
    }

    const player: PlayerRecord = { id: socketId, nickname, joinedAt: Date.now() };
    room.players.set(socketId, player);
    this.roomCodeBySocketId.set(socketId, code);
    this.logger.log(`${nickname} (${socketId}) joined room ${code}`);

    return { room: toRoomSnapshot(room), playerId: socketId };
  }

  /**
   * Removes a socket from its room, promoting a new host or destroying the room
   * as needed. Returns `null` when the socket was not in a room, which is the
   * normal case for a disconnect from the landing page.
   */
  leaveRoom(socketId: string): RoomLeaveOutcome | null {
    const code = this.roomCodeBySocketId.get(socketId);
    if (code === undefined) {
      return null;
    }

    this.roomCodeBySocketId.delete(socketId);

    const room = this.rooms.get(code);
    if (room === undefined) {
      // Reverse index outlived the room; nothing left to broadcast.
      return { code, roomClosed: true, room: null, promotedHostId: null };
    }

    const player = room.players.get(socketId);
    room.players.delete(socketId);

    if (room.players.size === 0) {
      this.rooms.delete(code);
      this.logger.log(`Room ${code} closed (last player left)`);
      return { code, roomClosed: true, room: null, promotedHostId: null };
    }

    let promotedHostId: string | null = null;
    if (room.hostId === socketId) {
      const [nextHost] = [...room.players.values()];
      if (nextHost !== undefined) {
        room.hostId = nextHost.id;
        promotedHostId = nextHost.id;
        this.logger.log(
          `Room ${code}: host left, promoted ${nextHost.nickname} (${nextHost.id})`,
        );
      }
    }

    this.logger.log(
      `${player?.nickname ?? socketId} left room ${code} (${room.players.size} remaining)`,
    );

    return {
      code,
      roomClosed: false,
      room: toRoomSnapshot(room),
      promotedHostId,
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

  private assertNotInARoom(socketId: string): void {
    const code = this.roomCodeBySocketId.get(socketId);
    if (code !== undefined) {
      throw new RoomError(
        SOCKET_ERROR_CODE.AlreadyInRoom,
        `You are already in room ${code}. Leave it first.`,
      );
    }
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

function hasNickname(room: RoomRecord, nickname: string): boolean {
  const candidate = nickname.toLocaleLowerCase();
  for (const player of room.players.values()) {
    if (player.nickname.toLocaleLowerCase() === candidate) {
      return true;
    }
  }

  return false;
}

function toRoomSnapshot(room: RoomRecord): RoomSnapshot {
  const players: PlayerSnapshot[] = [...room.players.values()]
    .map((player) => ({
      id: player.id,
      nickname: player.nickname,
      isHost: player.id === room.hostId,
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
