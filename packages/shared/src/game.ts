import type { AnswerCard, PromptCard } from './cards';

export const GAME_PHASE = {
  /** No game running. The host may start one. */
  Lobby: 'lobby',
  /** Non-judge players are choosing what to play. */
  Selecting: 'selecting',
  /** Everyone has played; the judge is choosing a winner. */
  Judging: 'judging',
  /** The round is decided and everyone can see who played what. */
  RoundResult: 'roundResult',
  /** A game is in progress but there are too few connected players to deal. */
  Paused: 'paused',
  /** Someone hit the target score. Scores stand until a new game starts. */
  GameOver: 'gameOver',
} as const;

export type GamePhase = (typeof GAME_PHASE)[keyof typeof GAME_PHASE];

/**
 * One player's play for a round. `playerId` stays null until the round is
 * decided: the server never puts an owner on the wire while judging is open.
 */
export interface SubmissionView {
  readonly id: string;
  readonly cards: readonly AnswerCard[];
  readonly playerId: string | null;
}

/** The part of the game state everyone in the room is allowed to see. */
export interface GameSnapshot {
  readonly phase: GamePhase;
  readonly roundNumber: number;
  readonly judgeId: string | null;
  readonly prompt: PromptCard | null;
  /**
   * Connected players who still owe a play. Only populated while selecting,
   * where it says who everyone is waiting on, and it never maps a player to a
   * card.
   */
  readonly awaitingPlayerIds: readonly string[];
  /** Empty while selecting, anonymous while judging, owned once decided. */
  readonly submissions: readonly SubmissionView[];
  readonly winningSubmissionId: string | null;
  readonly roundWinnerId: string | null;
  readonly gameWinnerId: string | null;

  /**
   * Epoch milliseconds at which the current phase expires, or null for phases
   * with no clock (lobby, paused, gameOver). Clients render a countdown from
   * this deadline rather than counting down locally, so nothing drifts and a
   * player who reconnects mid-phase sees the true remaining time.
   */
  readonly phaseEndsAt: number | null;
  /** How long the phase was given, so a client can render how much is left. */
  readonly phaseDurationMs: number | null;
  /**
   * The server's clock when this snapshot was built. A client compares it with
   * its own to correct for a device clock that is simply wrong, which an
   * absolute deadline alone cannot survive.
   */
  readonly serverTime: number;
}

/**
 * A single player's private view, delivered only to that player's own socket.
 * Never broadcast to the room.
 */
export interface HandSnapshot {
  readonly code: string;
  readonly cards: readonly AnswerCard[];
  /** What this player already played this round, which only they can see early. */
  readonly submitted: readonly AnswerCard[];
}

/** Acknowledgement for the game actions, so a caller knows where it landed. */
export interface GameActionResult {
  readonly phase: GamePhase;
}
