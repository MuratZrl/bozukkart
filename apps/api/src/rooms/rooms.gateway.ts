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
  GAME_PHASE,
  HAND_STATE,
  JOIN_ROOM,
  LEAVE_ROOM,
  NEXT_ROUND,
  PICK_WINNER,
  ROOM_STATE,
  SOCKET_ERROR_CODE,
  START_GAME,
  SUBMIT_CARDS,
  createRoomSchema,
  joinRoomSchema,
  pickWinnerSchema,
  socketFail,
  socketOk,
  submitCardsSchema,
  zodErrorKey,
  type GameActionResult,
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
      this.publish(update);
    });
  }

  handleConnection(@ConnectedSocket() client: BozukkartSocket): void {
    this.logger.debug(`Socket connected: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: BozukkartSocket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);

    // The player keeps their seat; socket.io has already pulled this socket out
    // of its rooms, so the broadcast reaches everyone still connected.
    this.publish(this.rooms.markDisconnected(client.id));
  }

  @SubscribeMessage(CREATE_ROOM)
  async handleCreateRoom(
    @ConnectedSocket() client: BozukkartSocket,
    @MessageBody() body: unknown,
  ): Promise<SocketResult<RoomMembership>> {
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
      return socketFail(SOCKET_ERROR_CODE.InvalidPayload, zodErrorKey(parsed.error));
    }

    try {
      const result = this.rooms.createRoom(
        parsed.data.playerId,
        client.id,
        parsed.data.nickname,
        parsed.data.locale,
        parsed.data.targetScore,
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
      return socketFail(SOCKET_ERROR_CODE.InvalidPayload, zodErrorKey(parsed.error));
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
        return socketFail(SOCKET_ERROR_CODE.NotInRoom, 'errors.notInRoom');
      }

      await client.leave(update.code);
      this.publish(update);

      return socketOk({ code: update.code, roomClosed: update.roomClosed });
    } catch (error: unknown) {
      return this.toFailure(error, 'leave room');
    }
  }

  @SubscribeMessage(START_GAME)
  handleStartGame(
    @ConnectedSocket() client: BozukkartSocket,
  ): SocketResult<GameActionResult> {
    return this.runGameAction(client, 'start game', () =>
      this.rooms.startGame(client.id),
    );
  }

  @SubscribeMessage(NEXT_ROUND)
  handleNextRound(
    @ConnectedSocket() client: BozukkartSocket,
  ): SocketResult<GameActionResult> {
    return this.runGameAction(client, 'deal next round', () =>
      this.rooms.nextRound(client.id),
    );
  }

  @SubscribeMessage(SUBMIT_CARDS)
  handleSubmitCards(
    @ConnectedSocket() client: BozukkartSocket,
    @MessageBody() body: unknown,
  ): SocketResult<GameActionResult> {
    const parsed = submitCardsSchema.safeParse(body);
    if (!parsed.success) {
      return socketFail(SOCKET_ERROR_CODE.InvalidPayload, zodErrorKey(parsed.error));
    }

    return this.runGameAction(client, 'submit cards', () =>
      this.rooms.submitCards(client.id, parsed.data.cardIds),
    );
  }

  @SubscribeMessage(PICK_WINNER)
  handlePickWinner(
    @ConnectedSocket() client: BozukkartSocket,
    @MessageBody() body: unknown,
  ): SocketResult<GameActionResult> {
    const parsed = pickWinnerSchema.safeParse(body);
    if (!parsed.success) {
      return socketFail(SOCKET_ERROR_CODE.InvalidPayload, zodErrorKey(parsed.error));
    }

    return this.runGameAction(client, 'pick winner', () =>
      this.rooms.pickWinner(client.id, parsed.data.submissionId),
    );
  }

  /** Runs a state transition, publishes the result and acks with the new phase. */
  private runGameAction(
    client: BozukkartSocket,
    action: string,
    move: () => RoomUpdate,
  ): SocketResult<GameActionResult> {
    try {
      const update = move();
      this.publish(update);

      return socketOk({
        phase: update.room?.game.phase ?? GAME_PHASE.Lobby,
      });
    } catch (error: unknown) {
      this.logger.debug(`${client.id} could not ${action}`);
      return this.toFailure(error, action);
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
    this.publish(result.vacatedRoom);

    this.server.to(code).emit(ROOM_STATE, result.membership.room);
    this.deliverHands(result.hands);
  }

  /**
   * The single place room state leaves the server: the public snapshot goes to
   * the whole room, each private hand goes to exactly one socket.
   */
  private publish(update: RoomUpdate | null): void {
    if (update === null) {
      return;
    }

    if (update.room !== null) {
      this.server.to(update.code).emit(ROOM_STATE, update.room);
    }

    this.deliverHands(update.hands);
  }

  private deliverHands(hands: RoomUpdate['hands']): void {
    for (const delivery of hands) {
      this.server.to(delivery.socketId).emit(HAND_STATE, delivery.hand);
    }
  }

  private toFailure<TData>(error: unknown, action: string): SocketResult<TData> {
    if (error instanceof RoomError) {
      return socketFail(error.code, error.key, error.params);
    }

    this.logger.error(`Unhandled error while trying to ${action}`, error);

    return socketFail(SOCKET_ERROR_CODE.Internal, 'errors.internal');
  }
}
