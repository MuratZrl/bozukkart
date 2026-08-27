import type {
  AnswerCard,
  GamePhase,
  HandSnapshot,
  Locale,
  PromptCard,
  RoomMembership,
  RoomSnapshot,
} from '@bozukkart/shared';

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
  /** Private to this player. Survives a disconnect for the grace period. */
  hand: AnswerCard[];
  score: number;
}

/** Draw and discard piles for one room, dealt from one locale's deck only. */
export interface DeckState {
  promptDraw: PromptCard[];
  promptDiscard: PromptCard[];
  answerDraw: AnswerCard[];
  answerDiscard: AnswerCard[];
}

/** One player's play, with the owner attached. Never leaves the server as-is. */
export interface SubmissionRecord {
  readonly id: string;
  readonly playerId: string;
  readonly cards: readonly AnswerCard[];
}

export interface RoundRecord {
  readonly judgeId: string;
  readonly prompt: PromptCard;
  /** Keyed by player id, so a player can only ever hold one play. */
  readonly submissions: Map<string, SubmissionRecord>;
  /** Submission ids in the shuffled order the judge sees them. */
  revealOrder: string[];
  winningSubmissionId: string | null;
  winnerPlayerId: string | null;
}

/** Server-side record for a room. Insertion order of `players` is join order. */
export interface RoomRecord {
  readonly code: string;
  /** Player id, not a socket id. */
  hostId: string;
  readonly createdAt: number;
  readonly players: Map<string, PlayerRecord>;
  readonly locale: Locale;
  readonly targetScore: number;
  phase: GamePhase;
  roundNumber: number;
  /** Who judged last, so the rotation knows where it left off. */
  lastJudgeId: string | null;
  round: RoundRecord | null;
  deck: DeckState;
  gameWinnerId: string | null;

  /** Pending expiry for the current phase. Null whenever the phase has no clock. */
  phaseTimer: NodeJS.Timeout | null;
  /** Epoch ms the current phase expires at, mirrored to clients. */
  phaseEndsAt: number | null;
  phaseDurationMs: number | null;
  /**
   * Bumped on every phase change. An expiry callback that wakes up holding a
   * stale token is a timer that should already have been cancelled, so it does
   * nothing rather than firing into a phase that has moved on.
   */
  phaseToken: number;
}

/** A private hand addressed to exactly one connection. */
export interface HandDelivery {
  readonly socketId: string;
  readonly hand: HandSnapshot;
}

/**
 * Something changed about a room and everyone still in it needs to hear about
 * it. Carries the private hands alongside the public snapshot so the gateway
 * has one thing to publish and cannot forget half of it.
 */
export interface RoomUpdate {
  readonly code: string;
  /** Post-change state, or `null` when the room was destroyed. */
  readonly room: RoomSnapshot | null;
  readonly hands: readonly HandDelivery[];
  readonly roomClosed: boolean;
  /** Set when the host seat moved to a different player. */
  readonly promotedHostId: string | null;
}

/** Result of a player entering a room, whether fresh, reattached or displaced. */
export interface RoomEntryResult {
  readonly membership: RoomMembership;
  readonly hands: readonly HandDelivery[];
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
