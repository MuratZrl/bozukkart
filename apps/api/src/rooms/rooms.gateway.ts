import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import {
  CREATE_ROOM,
  JOIN_ROOM,
  LEAVE_ROOM,
  ROOM_STATE,
  SOCKET_ERROR_CODE,
  createRoomSchema,
  describeZodError,
  joinRoomSchema,
  socketFail,
  socketOk,
  type RoomDeparture,
  type RoomMembership,
  type SocketResult,
} from '@puncline/shared';

import { WEB_ORIGINS } from '../config';
import { RoomError } from './room.error';
import { RoomsService } from './rooms.service';
import type { RoomLeaveOutcome } from './rooms.types';
import type { PunclineServer, PunclineSocket } from './socket.types';

@WebSocketGateway({
  cors: { origin: WEB_ORIGINS, credentials: true },
  serveClient: false,
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RoomsGateway.name);

  @WebSocketServer()
  private readonly server!: PunclineServer;

  constructor(private readonly rooms: RoomsService) {}

  handleConnection(@ConnectedSocket() client: PunclineSocket): void {
    this.logger.debug(`Socket connected: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: PunclineSocket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);

    // socket.io has already pulled this socket out of its rooms, so the
    // broadcast below reaches exactly the players who are still there.
    const outcome = this.rooms.leaveRoom(client.id);
    if (outcome !== null) {
      this.publishRoomState(outcome);
    }
  }

  @SubscribeMessage(CREATE_ROOM)
  async handleCreateRoom(
    @ConnectedSocket() client: PunclineSocket,
    @MessageBody() body: unknown,
  ): Promise<SocketResult<RoomMembership>> {
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
      return socketFail(
        SOCKET_ERROR_CODE.InvalidPayload,
        describeZodError(parsed.error, 'Invalid create-room payload.'),
      );
    }

    try {
      const membership = this.rooms.createRoom(client.id, parsed.data.nickname);
      await client.join(membership.room.code);
      this.server.to(membership.room.code).emit(ROOM_STATE, membership.room);

      return socketOk(membership);
    } catch (error: unknown) {
      return this.toFailure(error, 'create room');
    }
  }

  @SubscribeMessage(JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: PunclineSocket,
    @MessageBody() body: unknown,
  ): Promise<SocketResult<RoomMembership>> {
    const parsed = joinRoomSchema.safeParse(body);
    if (!parsed.success) {
      return socketFail(
        SOCKET_ERROR_CODE.InvalidPayload,
        describeZodError(parsed.error, 'Invalid join-room payload.'),
      );
    }

    try {
      const membership = this.rooms.joinRoom(
        client.id,
        parsed.data.code,
        parsed.data.nickname,
      );
      await client.join(membership.room.code);
      this.server.to(membership.room.code).emit(ROOM_STATE, membership.room);

      return socketOk(membership);
    } catch (error: unknown) {
      return this.toFailure(error, 'join room');
    }
  }

  /**
   * Takes no payload on purpose: the room a socket may leave is derived from the
   * connection itself, never from anything the client sends.
   */
  @SubscribeMessage(LEAVE_ROOM)
  async handleLeaveRoom(
    @ConnectedSocket() client: PunclineSocket,
  ): Promise<SocketResult<RoomDeparture>> {
    try {
      const outcome = this.rooms.leaveRoom(client.id);
      if (outcome === null) {
        return socketFail(
          SOCKET_ERROR_CODE.NotInRoom,
          'You are not in a room.',
        );
      }

      await client.leave(outcome.code);
      this.publishRoomState(outcome);

      return socketOk({ code: outcome.code, roomClosed: outcome.roomClosed });
    } catch (error: unknown) {
      return this.toFailure(error, 'leave room');
    }
  }

  private publishRoomState(outcome: RoomLeaveOutcome): void {
    if (outcome.room === null) {
      return;
    }

    this.server.to(outcome.code).emit(ROOM_STATE, outcome.room);
  }

  private toFailure<TData>(
    error: unknown,
    action: string,
  ): SocketResult<TData> {
    if (error instanceof RoomError) {
      return socketFail(error.code, error.message);
    }

    this.logger.error(`Unhandled error while trying to ${action}`, error);

    return socketFail(
      SOCKET_ERROR_CODE.Internal,
      'Something went wrong. Please try again.',
    );
  }
}
