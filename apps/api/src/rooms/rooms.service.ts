import { randomInt, randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  GAME_PHASE,
  HAND_SIZE,
  JUDGING_DURATION_MS,
  MAX_PLAYERS_PER_ROOM,
  MIN_PLAYERS_TO_START,
  MIN_SUBMISSIONS_TO_JUDGE,
  RECONNECT_GRACE_PERIOD_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROUND_RESULT_DURATION_MS,
  SELECTING_DURATION_MS,
  SOCKET_ERROR_CODE,
  type AnswerCard,
  type GamePhase,
  type GameSnapshot,
  type HandSnapshot,
  type Locale,
  type PlayerSnapshot,
  type RoomSnapshot,
  type SubmissionView,
} from '@bozukkart/shared';

import {
  createDeckState,
  discardAnswers,
  discardPrompt,
  drawAnswer,
  drawPrompt,
  shuffle,
} from './deck';
import { RoomError } from './room.error';
import { deserializeRoom, type SerializedRoom } from './rooms.serialize';
import { RoomStore } from './rooms.store';
import type {
  HandDelivery,
  PlayerRecord,
  RoomEntryResult,
  RoomRecord,
  RoomUpdate,
  RoomUpdateListener,
  RoundRecord,
  SubmissionRecord,
} from './rooms.types';

/** Give up rather than spin forever once the code space is saturated. */
const MAX_CODE_GENERATION_ATTEMPTS = 32;

/**
 * How long each phase runs before the server moves the game on by itself. A
 * phase mapped to null has no clock: the lobby, a paused game and a finished
 * one all wait for a person.
 */
const PHASE_DURATION_MS: Record<GamePhase, number | null> = {
  [GAME_PHASE.Lobby]: null,
  [GAME_PHASE.Selecting]: SELECTING_DURATION_MS,
  [GAME_PHASE.Judging]: JUDGING_DURATION_MS,
  [GAME_PHASE.RoundResult]: ROUND_RESULT_DURATION_MS,
  [GAME_PHASE.Paused]: null,
  [GAME_PHASE.GameOver]: null,
};

interface Seat {
  readonly room: RoomRecord;
  readonly player: PlayerRecord;
}

/**
 * In-memory room registry and round state machine. The maps below are the only
 * thing any game action reads; `RoomStore` is a write-through backup behind
 * them, so a restart has something to restore from and nothing else changes.
 * With no Redis configured the backup is inert and rooms live and die with the
 * process, which is how local development runs.
 *
 * Players are keyed by their client-generated player id, never by socket id, so
 * a dropped connection leaves the seat, the hand, the score and any play
 * already made exactly where they were until the grace timer gives up.
 *
 * Timed phases move the game on by themselves when nobody acts. Every phase
 * change goes through `enterPhase`, which is the only place a phase timer is
 * armed or cancelled, so a phase can never leave one running behind it.
 */
@Injectable()
export class RoomsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomsService.name);

  /** code -> room */
  private readonly rooms = new Map<string, RoomRecord>();

  /** player id -> room code */
  private readonly roomCodeByPlayerId = new Map<string, string>();

  /** socket id -> player id, so a disconnect resolves in O(1). */
  private readonly playerIdBySocketId = new Map<string, string>();

  private readonly updateListeners = new Set<RoomUpdateListener>();

  constructor(private readonly store: RoomStore) {}

  /**
   * Grace expiries fire on a timer with no socket call to answer, so the
   * gateway subscribes here to broadcast whatever they change.
   */
  onRoomUpdate(listener: RoomUpdateListener): void {
    this.updateListeners.add(listener);
  }

  /**
   * Pulls back whatever survived the last process, before the server starts
   * taking connections. A room that cannot be read is dropped and its key
   * deleted rather than allowed to stop the boot: one bad value must not cost
   * every other room in the store.
   */
  async onModuleInit(): Promise<void> {
    const stored = await this.store.loadAll();
    if (stored.length === 0) {
      return;
    }

    const restored: RoomRecord[] = [];

    for (const { code, raw } of stored) {
      try {
        const room = deserializeRoom(JSON.parse(raw) as SerializedRoom);

        // A payload that disagrees with its own key would be saved back under
        // a different one, quietly orphaning the key it came from.
        if (room.code !== code) {
          throw new Error(`key says ${code}, room says ${room.code}`);
        }

        this.rooms.set(room.code, room);
        restored.push(room);
      } catch (error: unknown) {
        this.logger.error(`Dropping unreadable room ${code}`, error);
        this.store.remove(code);
      }
    }

    for (const room of restored) {
      for (const player of room.players.values()) {
        this.roomCodeByPlayerId.set(player.id, room.code);

        // Nobody walked out: the restart dropped them. Their old deadline is
        // not theirs to answer for, so everyone gets a full window to come
        // back rather than whatever happened to be left of the last one.
        this.scheduleGraceExpiry(room.code, player);
      }
    }

    // playerIdBySocketId is deliberately left empty. Every socket that spoke
    // for these players died with the last process, and the replacements have
    // not connected yet; a reattach is what fills it back in.

    // Clocks last, once every room is in the registry: an expiry below can
    // fire straight away and walk the rooms, and it has to see all of them.
    for (const room of restored) {
      this.rearmPhase(room);
    }

    this.logger.log(`Restored ${restored.length} room(s) from Redis`);
  }

  onModuleDestroy(): void {
    for (const room of this.rooms.values()) {
      clearPhaseTimer(room);
      for (const player of room.players.values()) {
        clearGraceTimer(player);
      }
    }

    this.rooms.clear();
    this.roomCodeByPlayerId.clear();
    this.playerIdBySocketId.clear();
    this.updateListeners.clear();
  }

  // ---------------------------------------------------------------- membership

  createRoom(
    playerId: string,
    socketId: string,
    nickname: string,
    locale: Locale,
    targetScore: number,
  ): RoomEntryResult {
    const vacatedRoom = this.releasePreviousSeat(playerId, null);

    const code = this.generateRoomCode();
    const now = Date.now();
    const host = newPlayer(playerId, socketId, nickname, now);
    const room: RoomRecord = {
      code,
      hostId: playerId,
      createdAt: now,
      players: new Map([[playerId, host]]),
      locale,
      targetScore,
      phase: GAME_PHASE.Lobby,
      roundNumber: 0,
      lastJudgeId: null,
      round: null,
      deck: createDeckState(locale),
      gameWinnerId: null,
      phaseTimer: null,
      phaseEndsAt: null,
      phaseDurationMs: null,
      phaseToken: 0,
    };

    this.rooms.set(code, room);
    this.indexPlayer(playerId, socketId, code);
    // Entering a room answers with a RoomEntryResult, which does not go through
    // buildUpdate, so the two chokepoints miss it. Without these three saves a
    // room would not reach the store until its first game action, and a restart
    // during the lobby would lose it along with everyone waiting in it.
    this.store.save(room);
    this.logger.log(
      `Room ${code} created by ${nickname} (${locale}, first to ${targetScore})`,
    );

    return {
      membership: { room: toRoomSnapshot(room), playerId },
      hands: collectHands(room),
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
      throw new RoomError(SOCKET_ERROR_CODE.RoomNotFound, 'errors.roomNotFound', {
        code,
      });
    }

    const existing = room.players.get(playerId);
    if (existing !== undefined) {
      return this.reattach(room, existing, socketId, nickname);
    }

    const vacatedRoom = this.releasePreviousSeat(playerId, code);

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      throw new RoomError(SOCKET_ERROR_CODE.RoomFull, 'errors.roomFull', {
        max: MAX_PLAYERS_PER_ROOM,
      });
    }

    this.assertNicknameAvailable(room, nickname, null);

    const player = newPlayer(playerId, socketId, nickname, Date.now());
    room.players.set(playerId, player);
    this.indexPlayer(playerId, socketId, code);
    // See createRoom: an entry result never reaches buildUpdate.
    this.store.save(room);
    this.logger.log(`${nickname} (${playerId}) joined room ${code}`);

    return {
      membership: { room: toRoomSnapshot(room), playerId },
      hands: collectHands(room),
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
   * A socket dropped. The seat, hand, play and score all stay put until the
   * grace timer expires; everyone else is told so the lobby can grey them out.
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

    // Losing a player can complete a round or drop the room under the minimum,
    // but it never abandons the round: they may still come back.
    this.reconcileGame(room, null);

    return this.buildUpdate(room);
  }

  // ---------------------------------------------------------------- game moves

  /** Host only. Starts a fresh game from the lobby, or a rematch after a win. */
  startGame(socketId: string): RoomUpdate {
    const { room, player } = this.requireSeat(socketId);
    this.assertHost(room, player);
    this.assertPhase(room, [GAME_PHASE.Lobby, GAME_PHASE.GameOver]);
    this.assertEnoughPlayers(room);

    for (const seated of room.players.values()) {
      discardAnswers(room.deck, seated.hand);
      seated.hand = [];
      seated.score = 0;
    }

    room.deck = createDeckState(room.locale);
    room.roundNumber = 0;
    room.lastJudgeId = null;
    room.gameWinnerId = null;
    room.round = null;

    this.logger.log(`Room ${room.code}: game started`);
    this.startRound(room);

    return this.buildUpdate(room);
  }

  /** Host only. Deals the next round after a result, or resumes from paused. */
  nextRound(socketId: string): RoomUpdate {
    const { room, player } = this.requireSeat(socketId);
    this.assertHost(room, player);
    this.assertPhase(room, [GAME_PHASE.RoundResult, GAME_PHASE.Paused]);
    this.assertEnoughPlayers(room);

    this.startRound(room);

    return this.buildUpdate(room);
  }

  /** Any non-judge player, once per round, with cards they actually hold. */
  submitCards(socketId: string, cardIds: readonly string[]): RoomUpdate {
    const { room, player } = this.requireSeat(socketId);
    this.assertPhase(room, [GAME_PHASE.Selecting]);

    const round = this.requireRound(room);

    if (player.id === round.judgeId) {
      throw new RoomError(
        SOCKET_ERROR_CODE.JudgeCannotSubmit,
        'errors.judgeCannotSubmit',
      );
    }

    if (round.submissions.has(player.id)) {
      throw new RoomError(
        SOCKET_ERROR_CODE.AlreadySubmitted,
        'errors.alreadySubmitted',
      );
    }

    if (cardIds.length !== round.prompt.pick) {
      throw new RoomError(
        SOCKET_ERROR_CODE.WrongPickCount,
        'errors.wrongPickCount',
        { pick: round.prompt.pick },
      );
    }

    if (new Set(cardIds).size !== cardIds.length) {
      throw new RoomError(
        SOCKET_ERROR_CODE.DuplicateCards,
        'errors.duplicateCards',
      );
    }

    // Order matters for multi-blank prompts, so keep the order they sent.
    const cards: AnswerCard[] = cardIds.map((cardId) => {
      const card = player.hand.find((held) => held.id === cardId);
      if (card === undefined) {
        throw new RoomError(
          SOCKET_ERROR_CODE.CardNotInHand,
          'errors.cardNotInHand',
        );
      }

      return card;
    });

    const played = new Set(cardIds);
    player.hand = player.hand.filter((card) => !played.has(card.id));

    const submission: SubmissionRecord = {
      id: randomUUID(),
      playerId: player.id,
      cards,
    };
    round.submissions.set(player.id, submission);
    this.logger.debug(`${player.nickname} played in room ${room.code}`);

    this.maybeOpenJudging(room);

    return this.buildUpdate(room);
  }

  /** Judge only, once judging is open. */
  pickWinner(socketId: string, submissionId: string): RoomUpdate {
    const { room, player } = this.requireSeat(socketId);
    this.assertPhase(room, [GAME_PHASE.Judging]);

    const round = this.requireRound(room);

    if (player.id !== round.judgeId) {
      throw new RoomError(SOCKET_ERROR_CODE.NotJudge, 'errors.notJudge');
    }

    const submission = findSubmission(round, submissionId);
    if (submission === null) {
      throw new RoomError(
        SOCKET_ERROR_CODE.SubmissionNotFound,
        'errors.submissionNotFound',
      );
    }

    this.awardWinner(room, submission);

    return this.buildUpdate(room);
  }

  // ---------------------------------------------------------------- diagnostics

  getRoom(code: string): RoomSnapshot | null {
    const room = this.rooms.get(code);
    return room === undefined ? null : toRoomSnapshot(room);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  // ---------------------------------------------------------------- round logic

  // ---------------------------------------------------------------- the clock

  /**
   * The single way a phase ever changes. Cancels whatever timer the old phase
   * had and arms the new one, so a leaked or double-firing timer is not
   * something a caller can cause by forgetting.
   */
  private enterPhase(room: RoomRecord, phase: GamePhase): void {
    clearPhaseTimer(room);
    room.phase = phase;
    room.phaseToken += 1;

    const duration = PHASE_DURATION_MS[phase];
    if (duration === null) {
      room.phaseEndsAt = null;
      room.phaseDurationMs = null;
      return;
    }

    const token = room.phaseToken;
    const { code } = room;

    room.phaseDurationMs = duration;
    room.phaseEndsAt = Date.now() + duration;

    const timer = setTimeout(() => {
      this.expirePhase(code, phase, token);
    }, duration);

    // A pending phase timer must never hold the process open on shutdown.
    timer.unref();
    room.phaseTimer = timer;
  }

  /**
   * Puts the clock back on a restored room. The deadline is absolute, so what
   * is left of it survived the restart even though the handle did not; only
   * the shortfall gets armed, never a fresh full phase. Phase and token come
   * off the room as restored, so the same guard that makes a cancelled timer
   * harmless covers this one too.
   */
  private rearmPhase(room: RoomRecord): void {
    if (room.phaseEndsAt === null) {
      // Lobby, paused and game over run no clock; there is nothing to put back.
      return;
    }

    const { code, phase, phaseToken } = room;
    const remaining = room.phaseEndsAt - Date.now();

    if (remaining <= 0) {
      // The phase ran out while the process was down. Move the room on now
      // rather than parking it in a phase whose clock is already spent.
      this.logger.log(`Room ${code}: ${phase} ran out while the API was down`);
      this.expirePhase(code, phase, phaseToken);
      return;
    }

    const timer = setTimeout(() => {
      this.expirePhase(code, phase, phaseToken);
    }, remaining);

    timer.unref();
    room.phaseTimer = timer;
  }

  /**
   * A phase ran out. The token check throws away any callback that belongs to a
   * phase the room has already left, which is the one way a cancelled timer
   * could still do damage.
   */
  private expirePhase(code: string, phase: GamePhase, token: number): void {
    const room = this.rooms.get(code);
    if (room === undefined || room.phaseToken !== token || room.phase !== phase) {
      return;
    }

    room.phaseTimer = null;

    switch (phase) {
      case GAME_PHASE.Selecting:
        this.expireSelecting(room);
        break;
      case GAME_PHASE.Judging:
        this.expireJudging(room);
        break;
      case GAME_PHASE.RoundResult:
        this.logger.log(`Room ${room.code}: round result timed out, dealing on`);
        this.startRound(room);
        break;
      default:
        return;
    }

    this.emitUpdate(this.buildUpdate(room));
  }

  /**
   * Anyone who did not play is simply skipped for the round. With too few plays
   * left there is nothing to judge between, so the round is thrown away.
   */
  private expireSelecting(room: RoomRecord): void {
    const round = room.round;
    if (round === null) {
      this.startRound(room);
      return;
    }

    if (round.submissions.size < MIN_SUBMISSIONS_TO_JUDGE) {
      this.logger.log(
        `Room ${room.code}: only ${round.submissions.size} play(s) in time, abandoning round ${room.roundNumber}`,
      );
      this.startRound(room);
      return;
    }

    this.logger.log(
      `Room ${room.code}: selecting timed out, judging ${round.submissions.size} play(s)`,
    );
    this.openJudging(room, round);
  }

  /** Nobody judged in time, so the round is decided by the deck instead. */
  private expireJudging(room: RoomRecord): void {
    const round = room.round;
    if (round === null) {
      this.startRound(room);
      return;
    }

    const plays = [...round.submissions.values()];
    const winner = plays[randomInt(plays.length)];
    if (winner === undefined) {
      this.startRound(room);
      return;
    }

    this.logger.log(
      `Room ${room.code}: judging timed out, awarding round ${room.roundNumber} at random`,
    );
    this.awardWinner(room, winner);
  }

  /** Shuffles the plays into a reveal order and opens judging. */
  private openJudging(room: RoomRecord, round: RoundRecord): void {
    round.revealOrder = shuffle(
      [...round.submissions.values()].map((submission) => submission.id),
    );
    this.enterPhase(room, GAME_PHASE.Judging);
  }

  /** Scores a play and ends either the round or the game. */
  private awardWinner(room: RoomRecord, submission: SubmissionRecord): void {
    const round = room.round;
    if (round === null) {
      return;
    }

    round.winningSubmissionId = submission.id;
    round.winnerPlayerId = submission.playerId;

    const winner = room.players.get(submission.playerId);
    if (winner !== undefined) {
      winner.score += 1;

      if (winner.score >= room.targetScore) {
        room.gameWinnerId = winner.id;
        this.enterPhase(room, GAME_PHASE.GameOver);
        this.logger.log(
          `Room ${room.code}: ${winner.nickname} won the game ${winner.score}-${room.targetScore}`,
        );
        return;
      }

      this.logger.log(
        `Room ${room.code}: ${winner.nickname} took round ${room.roundNumber}`,
      );
    }

    this.enterPhase(room, GAME_PHASE.RoundResult);
  }

  private emitUpdate(update: RoomUpdate): void {
    // One of the two places the backup is written. A room that was just
    // destroyed is already out of the registry, so this skips it rather than
    // writing back a key `destroyRoom` has just deleted.
    const room = this.rooms.get(update.code);
    if (room !== undefined) {
      this.store.save(room);
    }

    for (const listener of this.updateListeners) {
      listener(update);
    }
  }

  /**
   * Deals a round: next judge in the rotation, a fresh prompt, and everyone
   * else topped back up to a full hand. Falls to paused rather than throwing if
   * there is nobody left to judge.
   */
  private startRound(room: RoomRecord): void {
    this.retireRound(room);

    const judgeId = this.pickNextJudge(room);
    if (judgeId === null || connectedPlayers(room).length < MIN_PLAYERS_TO_START) {
      this.enterPhase(room, GAME_PHASE.Paused);
      return;
    }

    const prompt = drawPrompt(room.deck);
    if (prompt === null) {
      // Only reachable with an empty deck, which no shipped locale has.
      this.logger.error(`Room ${room.code}: no prompt cards left to deal`);
      this.enterPhase(room, GAME_PHASE.Paused);
      return;
    }

    for (const player of room.players.values()) {
      if (player.id === judgeId) {
        continue;
      }

      while (player.hand.length < HAND_SIZE) {
        const card = drawAnswer(room.deck);
        if (card === null) {
          // Deck exhausted across every hand; deal short rather than hang.
          break;
        }

        player.hand.push(card);
      }
    }

    room.round = {
      judgeId,
      prompt,
      submissions: new Map(),
      revealOrder: [],
      winningSubmissionId: null,
      winnerPlayerId: null,
    };
    room.roundNumber += 1;
    room.lastJudgeId = judgeId;
    this.enterPhase(room, GAME_PHASE.Selecting);

    this.logger.log(
      `Room ${room.code}: round ${room.roundNumber} dealt, judge ${room.players.get(judgeId)?.nickname ?? judgeId}`,
    );

    // A round with nobody able to play would otherwise sit there forever.
    this.maybeOpenJudging(room);
  }

  /** Returns the current round's cards to the deck and clears it. */
  private retireRound(room: RoomRecord): void {
    const round = room.round;
    if (round === null) {
      return;
    }

    discardPrompt(room.deck, round.prompt);
    for (const submission of round.submissions.values()) {
      discardAnswers(room.deck, submission.cards);
    }

    room.round = null;
  }

  /**
   * Next connected player after whoever judged last, in join order. Null when
   * nobody is available, which the caller turns into a pause.
   */
  private pickNextJudge(room: RoomRecord): string | null {
    const order = [...room.players.values()];
    if (order.length === 0) {
      return null;
    }

    const lastIndex =
      room.lastJudgeId === null
        ? -1
        : order.findIndex((player) => player.id === room.lastJudgeId);

    for (let step = 1; step <= order.length; step += 1) {
      const candidate = order[(lastIndex + step + order.length) % order.length];
      if (candidate !== undefined && candidate.connected) {
        return candidate.id;
      }
    }

    return null;
  }

  /** Opens judging once every connected non-judge player has played. */
  private maybeOpenJudging(room: RoomRecord): void {
    const round = room.round;
    if (round === null || room.phase !== GAME_PHASE.Selecting) {
      return;
    }

    if (round.submissions.size === 0) {
      return;
    }

    const outstanding = connectedPlayers(room).filter(
      (player) =>
        player.id !== round.judgeId && !round.submissions.has(player.id),
    );

    if (outstanding.length > 0) {
      return;
    }

    this.openJudging(room, round);
    this.logger.log(
      `Room ${room.code}: judging open with ${round.submissions.size} plays`,
    );
  }

  /**
   * Puts the game back into a state that makes sense after the player set
   * changed. `removedPlayerId` is set only when someone actually left for good,
   * which is the one case that can cost the round its judge.
   */
  private reconcileGame(room: RoomRecord, removedPlayerId: string | null): void {
    if (room.phase === GAME_PHASE.Lobby || room.phase === GAME_PHASE.GameOver) {
      return;
    }

    if (connectedPlayers(room).length < MIN_PLAYERS_TO_START) {
      this.retireRound(room);
      // A paused game runs no clock; enterPhase cancels whatever was pending.
      this.enterPhase(room, GAME_PHASE.Paused);
      this.logger.log(
        `Room ${room.code}: paused, fewer than ${MIN_PLAYERS_TO_START} players connected`,
      );
      return;
    }

    const round = room.round;
    if (round === null) {
      this.enterPhase(room, GAME_PHASE.Paused);
      return;
    }

    // The judge gave up their seat for good: the round cannot be judged, so it
    // is abandoned and the rotation moves on.
    if (removedPlayerId !== null && removedPlayerId === round.judgeId) {
      this.logger.log(
        `Room ${room.code}: judge left for good, abandoning round ${room.roundNumber}`,
      );
      this.startRound(room);
      return;
    }

    if (room.phase === GAME_PHASE.Selecting) {
      this.maybeOpenJudging(room);
    }
  }

  // ---------------------------------------------------------------- seats

  private requireSeat(socketId: string): Seat {
    const playerId = this.playerIdBySocketId.get(socketId);
    if (playerId === undefined) {
      throw new RoomError(SOCKET_ERROR_CODE.NotInRoom, 'errors.notInRoom');
    }

    const room = this.findRoomOfPlayer(playerId);
    const player = room?.players.get(playerId);
    if (room === null || player === undefined) {
      throw new RoomError(SOCKET_ERROR_CODE.NotInRoom, 'errors.notInRoom');
    }

    return { room, player };
  }

  private assertHost(room: RoomRecord, player: PlayerRecord): void {
    if (room.hostId !== player.id) {
      throw new RoomError(SOCKET_ERROR_CODE.NotHost, 'errors.notHost');
    }
  }

  private assertPhase(room: RoomRecord, allowed: readonly GamePhase[]): void {
    if (!allowed.includes(room.phase)) {
      throw new RoomError(SOCKET_ERROR_CODE.WrongPhase, 'errors.wrongPhase');
    }
  }

  private assertEnoughPlayers(room: RoomRecord): void {
    if (connectedPlayers(room).length < MIN_PLAYERS_TO_START) {
      throw new RoomError(
        SOCKET_ERROR_CODE.NotEnoughPlayers,
        'errors.notEnoughPlayers',
        { min: MIN_PLAYERS_TO_START },
      );
    }
  }

  private requireRound(room: RoomRecord): RoundRecord {
    if (room.round === null) {
      throw new RoomError(
        SOCKET_ERROR_CODE.NoRoundInProgress,
        'errors.noRoundInProgress',
      );
    }

    return room.round;
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
    // See createRoom: an entry result never reaches buildUpdate. A reattach can
    // change the nickname and always drops the grace deadline, both of which
    // are stored.
    this.store.save(room);

    this.logger.log(
      `${nickname} reattached to room ${room.code}${
        room.hostId === player.id ? ' as host' : ''
      } with ${player.hand.length} cards and ${player.score} points`,
    );

    return {
      membership: { room: toRoomSnapshot(room), playerId: player.id },
      hands: collectHands(room),
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
        'errors.alreadyInRoom',
        { code: previousCode },
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

      // Their cards go back in the box, including anything already on the table.
      discardAnswers(room.deck, player.hand);
      player.hand = [];

      const round = room.round;
      const submission = round?.submissions.get(playerId);
      if (round !== undefined && round !== null && submission !== undefined) {
        discardAnswers(room.deck, submission.cards);
        round.submissions.delete(playerId);

        const revealIndex = round.revealOrder.indexOf(submission.id);
        if (revealIndex !== -1) {
          round.revealOrder.splice(revealIndex, 1);
        }
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
        hands: [],
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

    this.reconcileGame(room, playerId);

    return this.buildUpdate(room, promotedHostId);
  }

  /** Tears a room down, leaving no timer, index entry or stored copy behind. */
  private destroyRoom(room: RoomRecord): void {
    this.store.remove(room.code);
    clearPhaseTimer(room);

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

  /**
   * The single place a grace period is armed. Records the deadline as well as
   * the handle, the way `enterPhase` does for a phase: the handle is how this
   * process fires, the timestamp is what the deadline actually is.
   */
  private scheduleGraceExpiry(code: string, player: PlayerRecord): void {
    clearGraceTimer(player);

    const timer = setTimeout(() => {
      this.expireGrace(code, player.id);
    }, RECONNECT_GRACE_PERIOD_MS);

    // A pending grace timer must never hold the process open on shutdown.
    timer.unref();
    player.graceTimer = timer;
    player.graceEndsAt = Date.now() + RECONNECT_GRACE_PERIOD_MS;
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

    // The deadline has been reached, so it stops describing anything; clearing
    // it here keeps the pair in step for the removal that follows.
    player.graceTimer = null;
    player.graceEndsAt = null;
    this.logger.log(
      `${player.nickname} did not come back to room ${code}, giving up their seat`,
    );

    this.emitUpdate(this.removePlayer(room, playerId));
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
          'errors.nicknameTaken',
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

  private buildUpdate(
    room: RoomRecord,
    promotedHostId: string | null = null,
  ): RoomUpdate {
    // The other place the backup is written, and the one that covers the game.
    // A builder with a side effect is not lovely, but every state change ends
    // up here, and the alternative is a save call at each of the thirty-odd
    // sites that mutate a room — one of which would eventually be forgotten.
    this.store.save(room);

    return {
      code: room.code,
      room: toRoomSnapshot(room),
      hands: collectHands(room),
      roomClosed: false,
      promotedHostId,
    };
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
      'errors.roomCodeUnavailable',
    );
  }
}

function newPlayer(
  id: string,
  socketId: string,
  nickname: string,
  joinedAt: number,
): PlayerRecord {
  return {
    id,
    socketId,
    nickname,
    joinedAt,
    connected: true,
    graceTimer: null,
    graceEndsAt: null,
    hand: [],
    score: 0,
  };
}

function clearPhaseTimer(room: RoomRecord): void {
  if (room.phaseTimer !== null) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
}

/**
 * The single place a grace period is cancelled, so reattach, removal and
 * teardown all drop the deadline by going through here. The timestamp is
 * cleared unconditionally: a handle that some other path already nulled must
 * not leave a deadline behind describing a seat nobody is holding.
 */
function clearGraceTimer(player: PlayerRecord): void {
  if (player.graceTimer !== null) {
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
  }

  player.graceEndsAt = null;
}

function connectedPlayers(room: RoomRecord): PlayerRecord[] {
  return [...room.players.values()].filter((player) => player.connected);
}

function findSubmission(
  round: RoundRecord,
  submissionId: string,
): SubmissionRecord | null {
  for (const submission of round.submissions.values()) {
    if (submission.id === submissionId) {
      return submission;
    }
  }

  return null;
}

/** One private hand per connected player, addressed to their current socket. */
function collectHands(room: RoomRecord): HandDelivery[] {
  const deliveries: HandDelivery[] = [];

  for (const player of room.players.values()) {
    if (player.socketId === null || !player.connected) {
      continue;
    }

    deliveries.push({
      socketId: player.socketId,
      hand: toHandSnapshot(room, player),
    });
  }

  return deliveries;
}

function toHandSnapshot(room: RoomRecord, player: PlayerRecord): HandSnapshot {
  const submission = room.round?.submissions.get(player.id);

  return {
    code: room.code,
    cards: [...player.hand],
    submitted: submission === undefined ? [] : [...submission.cards],
  };
}

function toGameSnapshot(room: RoomRecord): GameSnapshot {
  const round = room.round;
  const decided =
    room.phase === GAME_PHASE.RoundResult || room.phase === GAME_PHASE.GameOver;

  let submissions: SubmissionView[] = [];
  if (round !== null && (room.phase === GAME_PHASE.Judging || decided)) {
    submissions = round.revealOrder.flatMap((submissionId) => {
      const submission = findSubmission(round, submissionId);
      if (submission === null) {
        return [];
      }

      return [
        {
          id: submission.id,
          cards: [...submission.cards],
          // Owners stay off the wire until the round is decided.
          playerId: decided ? submission.playerId : null,
        },
      ];
    });
  }

  const awaitingPlayerIds =
    round !== null && room.phase === GAME_PHASE.Selecting
      ? connectedPlayers(room)
          .filter(
            (player) =>
              player.id !== round.judgeId && !round.submissions.has(player.id),
          )
          .map((player) => player.id)
      : [];

  return {
    phase: room.phase,
    roundNumber: room.roundNumber,
    judgeId: round?.judgeId ?? null,
    prompt: round?.prompt ?? null,
    awaitingPlayerIds,
    submissions,
    winningSubmissionId: round?.winningSubmissionId ?? null,
    roundWinnerId: round?.winnerPlayerId ?? null,
    gameWinnerId: room.gameWinnerId,
    phaseEndsAt: room.phaseEndsAt,
    phaseDurationMs: room.phaseDurationMs,
    serverTime: Date.now(),
  };
}

function toRoomSnapshot(room: RoomRecord): RoomSnapshot {
  const players: PlayerSnapshot[] = [...room.players.values()]
    .map((player) => ({
      id: player.id,
      nickname: player.nickname,
      isHost: player.id === room.hostId,
      connected: player.connected,
      score: player.score,
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
    locale: room.locale,
    targetScore: room.targetScore,
    game: toGameSnapshot(room),
  };
}
