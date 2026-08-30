/**
 * Round-trip test for the room serializer. Pure conversion, no server and no
 * sockets: it builds a room record by hand, sends it through JSON and back,
 * and checks what survived.
 *
 *   pnpm --filter @bozukkart/api build
 *   pnpm --filter @bozukkart/api test:serialize
 *
 * Runs against dist, so it needs a build first — `nest build` wipes the output
 * directory, and a stale dist would be testing the last change, not this one.
 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  GAME_PHASE,
  HAND_SIZE,
  RECONNECT_GRACE_PERIOD_MS,
  SELECTING_DURATION_MS,
} from '@bozukkart/shared';

import { createDeckState, drawAnswer, drawPrompt } from '../dist/rooms/deck.js';
import {
  deserializeRoom,
  serializeRoom,
} from '../dist/rooms/rooms.serialize.js';

const LOCALE = 'en';

const failures = [];
const log = (...args) => {
  console.log(...args);
};

function check(label, condition, detail) {
  if (condition) {
    log(`  PASS  ${label}`);
    return;
  }

  failures.push(label);
  log(
    `  FAIL  ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`,
  );
}

function dealHand(deck) {
  const hand = [];
  while (hand.length < HAND_SIZE) {
    const card = drawAnswer(deck);
    if (card === null) {
      break;
    }

    hand.push(card);
  }

  return hand;
}

/**
 * A room two players deep and mid-round: a prompt on the table, one play made,
 * a selecting clock running, and the other seat being held behind a grace
 * timer. Both timers are real and armed, so the serializer has live handles to
 * drop rather than nulls that would pass by accident.
 */
function buildRoom() {
  const now = Date.now();
  const deck = createDeckState(LOCALE);
  const prompt = drawPrompt(deck);

  const judgeId = randomUUID();
  const playerId = randomUUID();

  // Armed for real, and unref'd so a pending timer cannot hold this process
  // open the way the service does it.
  const phaseTimer = setTimeout(() => {}, SELECTING_DURATION_MS);
  phaseTimer.unref();
  const graceTimer = setTimeout(() => {}, RECONNECT_GRACE_PERIOD_MS);
  graceTimer.unref();

  const judge = {
    id: judgeId,
    socketId: 'socket-judge',
    nickname: 'Alice',
    joinedAt: now - 5_000,
    connected: true,
    graceTimer: null,
    graceEndsAt: null,
    hand: [],
    score: 2,
  };

  // Joined second, dropped, and inside their grace period: the one player whose
  // deadline has to survive the trip.
  const player = {
    id: playerId,
    socketId: null,
    nickname: 'Bob',
    joinedAt: now - 2_000,
    connected: false,
    graceTimer,
    graceEndsAt: now + RECONNECT_GRACE_PERIOD_MS,
    hand: dealHand(deck),
    score: 1,
  };

  const submission = {
    id: randomUUID(),
    playerId,
    cards: player.hand.splice(0, prompt.pick),
  };

  const room = {
    code: 'QFTM',
    hostId: judgeId,
    createdAt: now - 5_000,
    players: new Map([
      [judgeId, judge],
      [playerId, player],
    ]),
    locale: LOCALE,
    targetScore: 7,
    phase: GAME_PHASE.Selecting,
    roundNumber: 3,
    lastJudgeId: judgeId,
    round: {
      judgeId,
      prompt,
      submissions: new Map([[playerId, submission]]),
      revealOrder: [],
      winningSubmissionId: null,
      winnerPlayerId: null,
    },
    deck,
    gameWinnerId: null,
    phaseTimer,
    phaseEndsAt: now + SELECTING_DURATION_MS,
    phaseDurationMs: SELECTING_DURATION_MS,
    phaseToken: 6,
  };

  return { room, judgeId, playerId, submission, prompt, phaseTimer, graceTimer };
}

/** What a restore is supposed to produce: the room, minus what cannot survive. */
function expectedAfterRestore(room) {
  const players = new Map();
  for (const [id, player] of room.players) {
    players.set(id, {
      ...player,
      socketId: null,
      connected: false,
      graceTimer: null,
    });
  }

  return { ...room, players, phaseTimer: null };
}

const { room, judgeId, playerId, submission, prompt, phaseTimer, graceTimer } =
  buildRoom();

const originalPlayerOrder = [...room.players.keys()];
const originalHandSize = room.players.get(playerId).hand.length;
const originalDeckSizes = {
  promptDraw: room.deck.promptDraw.length,
  promptDiscard: room.deck.promptDiscard.length,
  answerDraw: room.deck.answerDraw.length,
  answerDiscard: room.deck.answerDiscard.length,
};

log('\n1. the dump is JSON-safe');
const dump = serializeRoom(room);
const throughJson = JSON.parse(JSON.stringify(dump));
check(
  'nothing is lost or mangled by a real JSON round trip',
  isDeepStrictEqual(throughJson, dump),
);
check('the phase timer handle is not in the dump', !('phaseTimer' in dump));
check(
  'no grace timer handle is in the dump',
  Object.values(dump.players).every((entry) => !('graceTimer' in entry)),
);
check(
  'no socket id is in the dump',
  Object.values(dump.players).every((entry) => !('socketId' in entry)),
);
check(
  'no connected flag is in the dump',
  Object.values(dump.players).every((entry) => !('connected' in entry)),
);
check('players became a plain object', dump.players.constructor === Object);
check(
  'submissions became a plain object',
  dump.round.submissions.constructor === Object,
);

log('\n2. the round trip restores everything else');
const restored = deserializeRoom(throughJson);
check(
  'deep equal to the original but for the connection fields and timers',
  isDeepStrictEqual(restored, expectedAfterRestore(room)),
  { restored: [...restored.players.keys()] },
);
check('players came back as a Map', restored.players instanceof Map);
check(
  'submissions came back as a Map',
  restored.round.submissions instanceof Map,
);

log('\n3. insertion order survives, because the judge rotation walks it');
check(
  'player order is exactly the order they joined in',
  isDeepStrictEqual([...restored.players.keys()], originalPlayerOrder),
  { expected: originalPlayerOrder, got: [...restored.players.keys()] },
);
check('the host is still first', [...restored.players.keys()][0] === judgeId);
check(
  'the player who joined second is still second',
  [...restored.players.keys()][1] === playerId,
);
check(
  'submission order survives too',
  isDeepStrictEqual([...restored.round.submissions.keys()], [playerId]),
);

log('\n4. what must not come back');
check('the phase timer is gone', restored.phaseTimer === null);
check(
  'every grace timer is gone',
  [...restored.players.values()].every((entry) => entry.graceTimer === null),
);
check(
  'every socket id is null, because the connections behind them are gone',
  [...restored.players.values()].every((entry) => entry.socketId === null),
);
check(
  'everyone comes back disconnected, including whoever was live',
  [...restored.players.values()].every((entry) => entry.connected === false),
);

log('\n5. what must come back');
check('phaseEndsAt survived', restored.phaseEndsAt === room.phaseEndsAt);
check(
  'phaseDurationMs survived',
  restored.phaseDurationMs === room.phaseDurationMs,
);
check('phaseToken survived', restored.phaseToken === room.phaseToken);
check(
  'the grace deadline survived, which is the whole point of storing it',
  restored.players.get(playerId).graceEndsAt ===
    room.players.get(playerId).graceEndsAt,
);
check(
  'a player who was not in grace still has no deadline',
  restored.players.get(judgeId).graceEndsAt === null,
);
check('scores survived', restored.players.get(judgeId).score === 2);
check('the host seat survived', restored.hostId === judgeId);
check('the round number survived', restored.roundNumber === 3);
check('lastJudgeId survived', restored.lastJudgeId === judgeId);

log('\n6. the cards, all of them');
check('the prompt on the table survived', restored.round.prompt.id === prompt.id);
check(
  'the play already made survived, in order',
  isDeepStrictEqual(
    [...restored.round.submissions.values()][0].cards.map((card) => card.id),
    submission.cards.map((card) => card.id),
  ),
);
check(
  'the private hand survived',
  restored.players.get(playerId).hand.length === originalHandSize,
);
check(
  'the whole deck survived, both piles of both kinds',
  isDeepStrictEqual(
    {
      promptDraw: restored.deck.promptDraw.length,
      promptDiscard: restored.deck.promptDiscard.length,
      answerDraw: restored.deck.answerDraw.length,
      answerDiscard: restored.deck.answerDiscard.length,
    },
    originalDeckSizes,
  ),
);
check(
  'the draw pile came back in the same order it was shuffled into',
  isDeepStrictEqual(
    restored.deck.answerDraw.map((card) => card.id),
    room.deck.answerDraw.map((card) => card.id),
  ),
);

log('\n7. the dump does not alias the live room');
const beforeLength = dump.deck.answerDraw.length;
drawAnswer(room.deck);
room.players.get(playerId).hand.push({ id: 'en-a-001', locale: LOCALE, text: 'x' });
check(
  'drawing from the live deck does not shrink the dump',
  dump.deck.answerDraw.length === beforeLength,
);
check(
  'dealing to a live hand does not grow the dump',
  dump.players[playerId].hand.length === originalHandSize,
);

clearTimeout(phaseTimer);
clearTimeout(graceTimer);

log('');
if (failures.length > 0) {
  log(`${failures.length} CHECK(S) FAILED:`);
  for (const failure of failures) {
    log(`  - ${failure}`);
  }
  process.exit(1);
}

log('ALL CHECKS PASSED');
