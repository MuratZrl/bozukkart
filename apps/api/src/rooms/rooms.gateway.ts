import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
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
} from '@bozukkart/shared';

import { WEB_ORIGINS } from '../config';
import { RoomError } from './room.error';
import { RoomsService } from './rooms.service';
import type { RoomEntryResult, RoomUpdate } from './rooms.types';
import type { BozukkartServer, BozukkartSocket } from './socket.types';

@WebSocketGateway({
  cors: { origin: WEB_ORIGINS, credentials: true },
  serveClient: false,
})
export class RoomsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RoomsGateway.name);

  @WebSocketServer()
  private readonly server!: BozukkartServer;

  constructor(private readonly rooms: RoomsService) {}

  afterInit(): void {
    // Grace periods expire on a timer, with no socket call to acknowledge, so
    // the resulting removals have to be broadcast from here.
    this.rooms.onRoomUpdate((update) => {
      this.publishRoomState(update);
    });
  }

  handleConnection(@ConnectedSocket() client: BozukkartSocket): void {
    this.logger.debug(`Socket connected: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: BozukkartSocket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);

    // The player keeps their seat; socket.io has already pulled this socket out
    // of its rooms, so the broadcast reaches everyone still connected.
    this.publishRoomState(this.rooms.markDisconnected(client.id));
  }

  @SubscribeMessage(CREATE_ROOM)
  async handleCreateRoom(
    @ConnectedSocket() client: BozukkartSocket,
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
      const result = this.rooms.createRoom(
        parsed.data.playerId,
        client.id,
        parsed.data.nickname,
      );

      await this.applyEntry(client, result);

      return socketOk(result.membership);
    } catch (error: unknown) {
      return this.toFailure(error, 'create room');
    }
  }

  @SubscribeMessage(JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: BozukkartSocket,
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
      const result = this.rooms.joinRoom(
        parsed.data.playerId,
        client.id,
        parsed.data.code,
        parsed.data.nickname,
      );

      await this.applyEntry(client, result);

      return socketOk(result.membership);
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
    @ConnectedSocket() client: BozukkartSocket,
  ): Promise<SocketResult<RoomDeparture>> {
    try {
      const update = this.rooms.leaveRoom(client.id);
      if (update === null) {
        return socketFail(SOCKET_ERROR_CODE.NotInRoom, 'You are not in a room.');
      }

      await client.leave(update.code);
      this.publishRoomState(update);

      return socketOk({ code: update.code, roomClosed: update.roomClosed });
    } catch (error: unknown) {
      return this.toFailure(error, 'leave room');
    }
  }

  /** Wires up socket.io room membership and broadcasts for a create or join. */
  private async applyEntry(
    client: BozukkartSocket,
    result: RoomEntryResult,
  ): Promise<void> {
    const { code } = result.membership.room;

    if (result.displacedSocketId !== null) {
      // Same player, older connection. Stop feeding it this room's broadcasts.
      const displaced = this.server.sockets.sockets.get(
        result.displacedSocketId,
      );
      await displaced?.leave(code);
    }

    await client.join(code);

    // The room they abandoned to get here, if any, needs its own broadcast.
    this.publishRoomState(result.vacatedRoom);

    this.server.to(code).emit(ROOM_STATE, result.membership.room);
  }

  private publishRoomState(update: RoomUpdate | null): void {
    if (update === null || update.room === null) {
      return;
    }

    this.server.to(update.code).emit(ROOM_STATE, update.room);
  }

  private toFailure<TData>(error: unknown, action: string): SocketResult<TData> {
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
