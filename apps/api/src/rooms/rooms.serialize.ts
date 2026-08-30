import type {
  DeckState,
  PlayerRecord,
  RoomRecord,
  RoundRecord,
  SubmissionRecord,
} from './rooms.types';

/**
 * Pure conversion between a live `RoomRecord` and a JSON-safe dump of it.
 * Nothing here reads a clock, touches the registry or arms anything: it is the
 * shape change only, so a later pass can put the result wherever it likes.
 *
 * The serialized types are derived from the live ones with `Omit` rather than
 * declared side by side on purpose. A new field on `RoomRecord` or
 * `PlayerRecord` lands in the serialized type automatically and breaks the
 * builders below until it is handled, so state cannot be added and silently
 * left out of the dump — which is the one bug this file exists to prevent.
 */

/**
 * `socketId` and `connected` are dropped rather than written and ignored: both
 * would be lies in a dump. Every socket id in one refers to a connection that
 * no longer exists, and a `connected: true` stops being true the instant the
 * process holding that connection goes away.
 */
export type SerializedPlayer = Omit<
  PlayerRecord,
  'socketId' | 'connected' | 'graceTimer'
>;

/**
 * Keyed by player id, exactly like the `Map` it came from. Object key order is
 * insertion order for these keys — player ids are UUIDs, and the integer-like
 * keys that JavaScript would reorder ahead of the rest cannot occur. Judge
 * rotation walks this order, so the round-trip test asserts it explicitly
 * rather than trusting the note.
 */
export type SerializedRound = Omit<RoundRecord, 'submissions'> & {
  submissions: Record<string, SubmissionRecord>;
};

/** Already JSON-safe: four arrays of immutable cards. */
export type SerializedDeck = DeckState;

export type SerializedRoom = Omit<
  RoomRecord,
  'players' | 'round' | 'deck' | 'phaseTimer'
> & {
  players: Record<string, SerializedPlayer>;
  round: SerializedRound | null;
  deck: SerializedDeck;
};

/**
 * A JSON-safe dump of one room.
 *
 * Arrays are copied so the dump cannot be changed out from under its holder by
 * the room carrying on; the card objects inside them are shared, because every
 * field of a `PromptCard` and an `AnswerCard` is readonly and nothing in the
 * game ever mutates one. Timer handles are not included at all.
 */
export function serializeRoom(room: RoomRecord): SerializedRoom {
  return {
    code: room.code,
    hostId: room.hostId,
    createdAt: room.createdAt,
    players: serializePlayers(room.players),
    locale: room.locale,
    targetScore: room.targetScore,
    phase: room.phase,
    roundNumber: room.roundNumber,
    lastJudgeId: room.lastJudgeId,
    round: room.round === null ? null : serializeRound(room.round),
    deck: copyDeck(room.deck),
    gameWinnerId: room.gameWinnerId,
    phaseEndsAt: room.phaseEndsAt,
    phaseDurationMs: room.phaseDurationMs,
    phaseToken: room.phaseToken,
  };
}

/**
 * Rebuilds a live record from a dump. The result is inert: no timer is armed
 * and every player comes back disconnected, so a caller has to decide what to
 * do about the deadlines in `phaseEndsAt` and `graceEndsAt` before the room is
 * fit to serve. Both timestamps survive precisely so that decision can be made
 * on the real remaining time rather than a fresh full period.
 */
export function deserializeRoom(data: SerializedRoom): RoomRecord {
  return {
    code: data.code,
    hostId: data.hostId,
    createdAt: data.createdAt,
    players: deserializePlayers(data.players),
    locale: data.locale,
    targetScore: data.targetScore,
    phase: data.phase,
    roundNumber: data.roundNumber,
    lastJudgeId: data.lastJudgeId,
    round: data.round === null ? null : deserializeRound(data.round),
    deck: copyDeck(data.deck),
    gameWinnerId: data.gameWinnerId,
    // Re-arming is a later pass's job; a restored room runs no clock.
    phaseTimer: null,
    phaseEndsAt: data.phaseEndsAt,
    phaseDurationMs: data.phaseDurationMs,
    phaseToken: data.phaseToken,
  };
}

function serializePlayers(
  players: ReadonlyMap<string, PlayerRecord>,
): Record<string, SerializedPlayer> {
  const result: Record<string, SerializedPlayer> = {};

  for (const [playerId, player] of players) {
    result[playerId] = {
      id: player.id,
      nickname: player.nickname,
      joinedAt: player.joinedAt,
      graceEndsAt: player.graceEndsAt,
      hand: [...player.hand],
      score: player.score,
    };
  }

  return result;
}

function deserializePlayers(
  players: Record<string, SerializedPlayer>,
): Map<string, PlayerRecord> {
  const result = new Map<string, PlayerRecord>();

  for (const [playerId, player] of Object.entries(players)) {
    result.set(playerId, {
      id: player.id,
      // Every socket id in a dump refers to a connection that no longer
      // exists, so there is nothing to restore here and claiming otherwise
      // would hand out seats to sockets that are gone. Everyone comes back
      // disconnected and has to reattach for themselves.
      socketId: null,
      nickname: player.nickname,
      joinedAt: player.joinedAt,
      connected: false,
      graceTimer: null,
      graceEndsAt: player.graceEndsAt,
      hand: [...player.hand],
      score: player.score,
    });
  }

  return result;
}

function serializeRound(round: RoundRecord): SerializedRound {
  const submissions: Record<string, SubmissionRecord> = {};

  for (const [playerId, submission] of round.submissions) {
    submissions[playerId] = copySubmission(submission);
  }

  return {
    judgeId: round.judgeId,
    prompt: round.prompt,
    submissions,
    revealOrder: [...round.revealOrder],
    winningSubmissionId: round.winningSubmissionId,
    winnerPlayerId: round.winnerPlayerId,
  };
}

function deserializeRound(round: SerializedRound): RoundRecord {
  const submissions = new Map<string, SubmissionRecord>();

  for (const [playerId, submission] of Object.entries(round.submissions)) {
    submissions.set(playerId, copySubmission(submission));
  }

  return {
    judgeId: round.judgeId,
    prompt: round.prompt,
    submissions,
    revealOrder: [...round.revealOrder],
    winningSubmissionId: round.winningSubmissionId,
    winnerPlayerId: round.winnerPlayerId,
  };
}

function copySubmission(submission: SubmissionRecord): SubmissionRecord {
  return {
    id: submission.id,
    playerId: submission.playerId,
    cards: [...submission.cards],
  };
}

/** Both directions are the same work: the deck's shape never changes. */
function copyDeck(deck: DeckState): DeckState {
  return {
    promptDraw: [...deck.promptDraw],
    promptDiscard: [...deck.promptDiscard],
    answerDraw: [...deck.answerDraw],
    answerDiscard: [...deck.answerDiscard],
  };
}
