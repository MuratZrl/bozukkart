/**
 * End-to-end smoke test for the room and round lifecycle. Drives a running API
 * over real socket.io connections; there is no mocking here on purpose.
 *
 *   pnpm --filter @bozukkart/api start      (or pnpm dev)
 *   pnpm --filter @bozukkart/api smoke
 *
 * Runs for roughly RECONNECT_GRACE_PERIOD_MS + a few seconds, because the
 * judge-drop and seat-expiry scenarios have to wait a grace period out.
 */
import { randomUUID } from 'node:crypto';

import {
  CREATE_ROOM,
  GAME_PHASE,
  HAND_SIZE,
  HAND_STATE,
  JOIN_ROOM,
  LEAVE_ROOM,
  MAX_PLAYERS_PER_ROOM,
  MIN_PLAYERS_TO_START,
  MIN_SUBMISSIONS_TO_JUDGE,
  NEXT_ROUND,
  PICK_WINNER,
  RECONNECT_GRACE_PERIOD_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_STATE,
  SELECTING_DURATION_MS,
  START_GAME,
  SUBMIT_CARDS,
  getDeck,
} from '@bozukkart/shared';
import { io } from 'socket.io-client';

const URL = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const ACK_TIMEOUT_MS = 5_000;
/** Slack after a grace period so the server's timer definitely fired. */
const EXPIRY_BUFFER_MS = 2_500;
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

function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ['websocket'], forceNew: true });
    socket.states = [];
    socket.hand = null;
    socket.on(ROOM_STATE, (room) => socket.states.push(room));
    socket.on(HAND_STATE, (hand) => {
      socket.hand = hand;
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function emit(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no ack for ${event}`)),
      ACK_TIMEOUT_MS,
    );

    socket.emit(event, ...args, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Long enough for a broadcast to land, short enough not to matter. */
const settle = () => wait(250);

const latest = (socket) => socket.states.at(-1);
const findPlayer = (room, playerId) =>
  room?.players.find((player) => player.id === playerId);
const errorCode = (result) => (result.ok ? null : result.error.code);

/** Spins up a room with `count` players and returns the sockets and ids. */
async function makeRoom(count, options = {}) {
  const players = [];

  for (let index = 0; index < count; index += 1) {
    const socket = await connect();
    const id = randomUUID();
    const nickname = `P${String(index)}`;

    const result =
      index === 0
        ? await emit(socket, CREATE_ROOM, {
            playerId: id,
            nickname,
            locale: LOCALE,
            ...(options.targetScore === undefined
              ? {}
              : { targetScore: options.targetScore }),
          })
        : await emit(socket, JOIN_ROOM, {
            playerId: id,
            code: players[0].code,
            nickname,
          });

    if (!result.ok) {
      throw new Error(`setup join failed: ${JSON.stringify(result.error)}`);
    }

    players.push({
      socket,
      id,
      nickname,
      code: result.data.room.code,
    });
  }

  await settle();
  return { code: players[0].code, players };
}

/** One named player plays a legal pick from the top of their hand. */
async function playOne(player) {
  const prompt = latest(player.socket)?.game.prompt;
  const cardIds = (player.socket.hand?.cards ?? [])
    .slice(0, prompt.pick)
    .map((card) => card.id);

  return emit(player.socket, SUBMIT_CARDS, { cardIds });
}

/** The non-judges of a room, in join order. */
function nonJudgePlayers(room) {
  const judgeId = latest(room.players[0].socket)?.game.judgeId;
  return room.players.filter((player) => player.id !== judgeId);
}

/** Everyone who is not judging plays a legal pick, in hand order. */
async function everyonePlays(room, players) {
  const judgeId = latest(players[0].socket)?.game.judgeId;
  const results = [];

  for (const player of players) {
    if (player.id === judgeId) {
      continue;
    }

    const prompt = latest(player.socket)?.game.prompt;
    const cardIds = (player.socket.hand?.cards ?? [])
      .slice(0, prompt.pick)
      .map((card) => card.id);

    results.push(await emit(player.socket, SUBMIT_CARDS, { cardIds }));
  }

  await settle();
  return results;
}

// --------------------------------------------------------------------------
log('\n1. create room');
const hostId = randomUUID();
const host = await connect();
const created = await emit(host, CREATE_ROOM, {
  playerId: hostId,
  nickname: '  Dave  ',
  locale: LOCALE,
});
check('create acked ok', created.ok === true, created);

const code = created.ok ? created.data.room.code : null;
const codePattern = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
check('code matches the room code alphabet', codePattern.test(code ?? ''), code);
check(
  'ack echoes the client-generated player id',
  created.ok && created.data.playerId === hostId,
  created,
);
check(
  'nickname trimmed by zod',
  created.ok && created.data.room.players[0].nickname === 'Dave',
  created,
);
check('creator is host', created.ok && created.data.room.hostId === hostId);
check(
  'room keeps the locale it was created with',
  created.ok && created.data.room.locale === LOCALE,
  created,
);
check(
  'room starts in the lobby phase with no round',
  created.ok &&
    created.data.room.game.phase === GAME_PHASE.Lobby &&
    created.data.room.game.prompt === null,
  created,
);

// --------------------------------------------------------------------------
log('\n2. validation (never trust the client)');
const guestId = randomUUID();
const guest = await connect();

const noLocale = await emit(guest, CREATE_ROOM, {
  playerId: guestId,
  nickname: 'Guest',
});
check('create without a locale rejected', errorCode(noLocale) === 'INVALID_PAYLOAD', noLocale);
const badLocale = await emit(guest, CREATE_ROOM, {
  playerId: guestId,
  nickname: 'Guest',
  locale: 'klingon',
});
check('unsupported locale rejected', errorCode(badLocale) === 'INVALID_PAYLOAD', badLocale);
const noPlayerId = await emit(guest, JOIN_ROOM, { code, nickname: 'Guest' });
check('missing playerId rejected', errorCode(noPlayerId) === 'INVALID_PAYLOAD', noPlayerId);
const badNick = await emit(guest, JOIN_ROOM, { playerId: guestId, code, nickname: 'x' });
check('short nickname rejected', errorCode(badNick) === 'INVALID_PAYLOAD', badNick);
check(
  'rejection carries a dictionary key, not prose',
  !badNick.ok && badNick.error.key === 'errors.nicknameTooShort',
  badNick,
);
const extraKey = await emit(guest, JOIN_ROOM, {
  playerId: guestId,
  code,
  nickname: 'Guest',
  isHost: true,
});
check('unknown key rejected (strictObject)', errorCode(extraKey) === 'INVALID_PAYLOAD', extraKey);
const missing = await emit(guest, JOIN_ROOM, {
  playerId: guestId,
  code: 'ZZZZ',
  nickname: 'Guest',
});
check('unknown room rejected', errorCode(missing) === 'ROOM_NOT_FOUND', missing);

// --------------------------------------------------------------------------
log('\n3. join and leave');
const joined = await emit(guest, JOIN_ROOM, {
  playerId: guestId,
  code: code.toLowerCase(),
  nickname: 'Guest',
});
check('join acked ok (lowercase code normalised)', joined.ok === true, joined);
check('room reports its cap', joined.ok && joined.data.room.maxPlayers === MAX_PLAYERS_PER_ROOM);
await settle();
check('host was told about the join', latest(host)?.players.length === 2, latest(host));

const secondRoom = await emit(guest, CREATE_ROOM, {
  playerId: guestId,
  nickname: 'Guest',
  locale: LOCALE,
});
check('a connected player cannot hold a second seat', errorCode(secondRoom) === 'ALREADY_IN_ROOM', secondRoom);

const carolId = randomUUID();
const carol = await connect();
const dupe = await emit(carol, JOIN_ROOM, { playerId: carolId, code, nickname: 'guest' });
check('duplicate nickname rejected (case-insensitive)', errorCode(dupe) === 'NICKNAME_TAKEN', dupe);

const carolJoin = await emit(carol, JOIN_ROOM, { playerId: carolId, code, nickname: 'Carol' });
check('third player joined', carolJoin.ok === true, carolJoin);
await settle();

const left = await emit(carol, LEAVE_ROOM);
check('explicit leave removes immediately, no grace', left.ok === true && left.data.roomClosed === false, left);
await settle();
check('a deliberate leaver is gone, not greyed out', findPlayer(latest(host), carolId) === undefined);
const leaveAgain = await emit(carol, LEAVE_ROOM);
check('leaving when not in a room rejected', errorCode(leaveAgain) === 'NOT_IN_ROOM', leaveAgain);

// --------------------------------------------------------------------------
log('\n4. disconnect starts a grace period instead of removing');
host.disconnect();
await settle();

const duringGrace = latest(guest);
check('the seat is kept', duringGrace?.players.length === 2, duringGrace);
check('the dropped player is flagged disconnected', findPlayer(duringGrace, hostId)?.connected === false);
check('host keeps the host seat while in grace', duringGrace?.hostId === hostId);

// --------------------------------------------------------------------------
log('\n5. reconnect within grace reattaches and keeps host');
const hostAgain = await connect();
const reconnected = await emit(hostAgain, JOIN_ROOM, { playerId: hostId, code, nickname: 'Dave' });
check('reconnect acked ok', reconnected.ok === true, reconnected);
check('no duplicate player was created', reconnected.ok && reconnected.data.room.players.length === 2);
check('host status survived the round trip', reconnected.ok && reconnected.data.room.hostId === hostId);
check('own nickname does not collide with own record', reconnected.ok === true);
host.disconnect();
guest.disconnect();
carol.disconnect();
hostAgain.disconnect();

// --------------------------------------------------------------------------
log('\n6. starting a game');
const short = await makeRoom(2);
const tooFew = await emit(short.players[0].socket, START_GAME);
check(
  `fewer than ${MIN_PLAYERS_TO_START} players cannot start`,
  errorCode(tooFew) === 'NOT_ENOUGH_PLAYERS',
  tooFew,
);
short.players.forEach((player) => player.socket.disconnect());

const game = await makeRoom(3);
const notHostStart = await emit(game.players[1].socket, START_GAME);
check('a non-host cannot start the game', errorCode(notHostStart) === 'NOT_HOST', notHostStart);

const started = await emit(game.players[0].socket, START_GAME);
check('host started the game', started.ok === true, started);
check('phase moved to selecting', started.ok && started.data.phase === GAME_PHASE.Selecting, started);
await settle();

const round1 = latest(game.players[0].socket);
check('a prompt was dealt', round1?.game.prompt !== null, round1?.game);
check('round number is 1', round1?.game.roundNumber === 1, round1?.game);
check('the first player judges first', round1?.game.judgeId === game.players[0].id, round1?.game);

const judge = game.players[0];
const nonJudges = game.players.slice(1);
check(
  'non-judge players were dealt a full hand',
  nonJudges.every((player) => player.socket.hand?.cards.length === HAND_SIZE),
  nonJudges.map((player) => player.socket.hand?.cards.length),
);
check('the judge is not dealt a hand', judge.socket.hand?.cards.length === 0, judge.socket.hand);
check(
  'hands are private: the room snapshot carries no cards',
  JSON.stringify(round1).includes('"cards"') === false,
);
check('no submissions are visible while selecting', round1?.game.submissions.length === 0);
check(
  'everyone can see who is still to play',
  round1?.game.awaitingPlayerIds.length === nonJudges.length,
  round1?.game.awaitingPlayerIds,
);

// --------------------------------------------------------------------------
log('\n7. what the rules refuse');
const judgeSubmit = await emit(judge.socket, SUBMIT_CARDS, {
  cardIds: [getDeck(LOCALE).answers[0].id],
});
check('the judge cannot submit', errorCode(judgeSubmit) === 'JUDGE_CANNOT_SUBMIT', judgeSubmit);

const player2 = nonJudges[0];
const prompt = latest(player2.socket).game.prompt;
const heldIds = new Set(player2.socket.hand.cards.map((card) => card.id));
const notHeld = getDeck(LOCALE)
  .answers.map((card) => card.id)
  .filter((id) => !heldIds.has(id));

const foreignCard = await emit(player2.socket, SUBMIT_CARDS, {
  cardIds: notHeld.slice(0, prompt.pick),
});
check('a card that is not in hand is rejected', errorCode(foreignCard) === 'CARD_NOT_IN_HAND', foreignCard);

const wrongCount = await emit(player2.socket, SUBMIT_CARDS, {
  cardIds: player2.socket.hand.cards.slice(0, prompt.pick + 1).map((card) => card.id),
});
check(
  'the wrong number of cards is rejected',
  errorCode(wrongCount) === 'WRONG_PICK_COUNT' || errorCode(wrongCount) === 'INVALID_PAYLOAD',
  wrongCount,
);

const earlyPick = await emit(judge.socket, PICK_WINNER, { submissionId: randomUUID() });
check('picking a winner while selecting is rejected', errorCode(earlyPick) === 'WRONG_PHASE', earlyPick);

const earlyNext = await emit(judge.socket, NEXT_ROUND);
check('dealing the next round mid-round is rejected', errorCode(earlyNext) === 'WRONG_PHASE', earlyNext);

// --------------------------------------------------------------------------
log('\n8. a full round');
const firstPlay = await emit(player2.socket, SUBMIT_CARDS, {
  cardIds: player2.socket.hand.cards.slice(0, prompt.pick).map((card) => card.id),
});
check('a legal play is accepted', firstPlay.ok === true, firstPlay);
await settle();
check(
  'still selecting until everyone has played',
  latest(judge.socket)?.game.phase === GAME_PHASE.Selecting,
);
check(
  'the played cards left the hand',
  player2.socket.hand.cards.length === HAND_SIZE - prompt.pick,
  player2.socket.hand.cards.length,
);
check('the player can see their own play', player2.socket.hand.submitted.length === prompt.pick);

const doubleSubmit = await emit(player2.socket, SUBMIT_CARDS, {
  cardIds: player2.socket.hand.cards.slice(0, prompt.pick).map((card) => card.id),
});
check('playing twice in a round is rejected', errorCode(doubleSubmit) === 'ALREADY_SUBMITTED', doubleSubmit);

const player3 = nonJudges[1];
const lastPlay = await emit(player3.socket, SUBMIT_CARDS, {
  cardIds: player3.socket.hand.cards.slice(0, prompt.pick).map((card) => card.id),
});
check('the last play is accepted', lastPlay.ok === true, lastPlay);
await settle();

const judging = latest(judge.socket);
check('judging opens once everyone has played', judging?.game.phase === GAME_PHASE.Judging, judging?.game);
check('every play is on the table', judging?.game.submissions.length === 2, judging?.game.submissions);
check(
  'plays are anonymous while judging',
  judging?.game.submissions.every((submission) => submission.playerId === null),
  judging?.game.submissions,
);

const notJudgePick = await emit(player2.socket, PICK_WINNER, {
  submissionId: judging.game.submissions[0].id,
});
check('a non-judge cannot pick the winner', errorCode(notJudgePick) === 'NOT_JUDGE', notJudgePick);

const ghostPick = await emit(judge.socket, PICK_WINNER, { submissionId: randomUUID() });
check('picking a play that does not exist is rejected', errorCode(ghostPick) === 'SUBMISSION_NOT_FOUND', ghostPick);

const winningId = judging.game.submissions[0].id;
const picked = await emit(judge.socket, PICK_WINNER, { submissionId: winningId });
check('the judge picked a winner', picked.ok === true, picked);
check('phase moved to the round result', picked.ok && picked.data.phase === GAME_PHASE.RoundResult, picked);
await settle();

const result = latest(judge.socket);
check('owners are revealed once the round is decided', result?.game.submissions.every((s) => s.playerId !== null));
check('the winning play is marked', result?.game.winningSubmissionId === winningId);
const roundWinnerId = result?.game.roundWinnerId;
check('the winner scored a point', findPlayer(result, roundWinnerId)?.score === 1, result?.players);
check(
  'nobody else scored',
  result?.players.filter((player) => player.score > 0).length === 1,
  result?.players,
);

const notHostNext = await emit(player2.socket, NEXT_ROUND);
check('a non-host cannot deal the next round', errorCode(notHostNext) === 'NOT_HOST', notHostNext);

const second = await emit(judge.socket, NEXT_ROUND);
check('the host dealt the next round', second.ok === true, second);
await settle();

const round2 = latest(judge.socket);
check('round number advanced', round2?.game.roundNumber === 2, round2?.game);
check('the judge rotated', round2?.game.judgeId === game.players[1].id, round2?.game);
check('the previous judge is now dealt in', judge.socket.hand.cards.length === HAND_SIZE);
check('scores carry across rounds', findPlayer(round2, roundWinnerId)?.score === 1);

// --------------------------------------------------------------------------
log('\n9. reaching the target score ends the game');
const sprint = await makeRoom(3, { targetScore: 1 });
await emit(sprint.players[0].socket, START_GAME);
await settle();
await everyonePlays(sprint, sprint.players);
const sprintJudging = latest(sprint.players[0].socket);
const sprintPick = await emit(sprint.players[0].socket, PICK_WINNER, {
  submissionId: sprintJudging.game.submissions[0].id,
});
check('phase moved straight to game over', sprintPick.ok && sprintPick.data.phase === GAME_PHASE.GameOver, sprintPick);
await settle();

const over = latest(sprint.players[0].socket);
check('a game winner is named', over?.game.gameWinnerId !== null, over?.game);
check('the winner has the target score', findPlayer(over, over.game.gameWinnerId)?.score === 1);
check('owners are revealed at game over', over?.game.submissions.every((s) => s.playerId !== null));

const replay = await emit(sprint.players[0].socket, START_GAME);
check('the host can start a rematch from game over', replay.ok === true, replay);
await settle();
check(
  'scores reset for the new game',
  latest(sprint.players[0].socket)?.players.every((player) => player.score === 0),
  latest(sprint.players[0].socket)?.players,
);
sprint.players.forEach((player) => player.socket.disconnect());

// --------------------------------------------------------------------------
log('\n10. dropping below the minimum pauses the game');
const fragile = await makeRoom(3);
await emit(fragile.players[0].socket, START_GAME);
await settle();
check('game running', latest(fragile.players[1].socket)?.game.phase === GAME_PHASE.Selecting);

fragile.players[2].socket.disconnect();
await settle();
const paused = latest(fragile.players[1].socket);
check('the game paused rather than crashing', paused?.game.phase === GAME_PHASE.Paused, paused?.game);
check('the round was cleared', paused?.game.prompt === null, paused?.game);
check('scores and seats survive the pause', paused?.players.length === 3, paused?.players);
const pausedStart = await emit(fragile.players[0].socket, NEXT_ROUND);
check(
  'the host cannot resume while short-handed',
  errorCode(pausedStart) === 'NOT_ENOUGH_PLAYERS',
  pausedStart,
);

const returning = await connect();
const cameBack = await emit(returning, JOIN_ROOM, {
  playerId: fragile.players[2].id,
  code: fragile.code,
  nickname: fragile.players[2].nickname,
});
check('the missing player can come back', cameBack.ok === true, cameBack);
check('still paused until the host acts', cameBack.ok && cameBack.data.room.game.phase === GAME_PHASE.Paused, cameBack);
const resumed = await emit(fragile.players[0].socket, NEXT_ROUND);
check('the host resumes from paused', resumed.ok && resumed.data.phase === GAME_PHASE.Selecting, resumed);
fragile.players.forEach((player) => player.socket.disconnect());
returning.disconnect();

// --------------------------------------------------------------------------
log('\n11. the round clock');
const clockRoom = await makeRoom(3);
const clockStart = await emit(clockRoom.players[0].socket, START_GAME);
check('game started', clockStart.ok === true, clockStart);
await settle();

const armed = latest(clockRoom.players[1].socket);
check(
  'selecting carries a deadline and a duration',
  typeof armed?.game.phaseEndsAt === 'number' &&
    armed?.game.phaseDurationMs === SELECTING_DURATION_MS,
  armed?.game,
);
check(
  'the deadline is roughly a full phase away',
  Math.abs(armed.game.phaseEndsAt - armed.game.serverTime - SELECTING_DURATION_MS) < 1_500,
  { endsAt: armed.game.phaseEndsAt, serverTime: armed.game.serverTime },
);
check(
  'the snapshot carries the server clock so a client can correct for skew',
  Math.abs(armed.game.serverTime - Date.now()) < 5_000,
  armed.game.serverTime,
);

const lateWatcher = await connect();
const lateJoin = await emit(lateWatcher, JOIN_ROOM, {
  playerId: randomUUID(),
  code: clockRoom.code,
  nickname: 'Late',
});
check(
  'a player joining mid-phase inherits the running deadline',
  lateJoin.ok && lateJoin.data.room.game.phaseEndsAt === armed.game.phaseEndsAt,
  lateJoin.ok ? lateJoin.data.room.game.phaseEndsAt : lateJoin,
);
await emit(lateWatcher, LEAVE_ROOM);
lateWatcher.disconnect();
clockRoom.players.forEach((player) => player.socket.disconnect());
await settle();

// --------------------------------------------------------------------------
log('\n12. the host can skip the round result');
const skipRoom = await makeRoom(3);
await emit(skipRoom.players[0].socket, START_GAME);
await settle();
await everyonePlays(skipRoom, skipRoom.players);
const skipJudging = latest(skipRoom.players[0].socket);
await emit(skipRoom.players[0].socket, PICK_WINNER, {
  submissionId: skipJudging.game.submissions[0].id,
});
await settle();
const skipResult = latest(skipRoom.players[0].socket);
check(
  'the round result runs on a short clock of its own',
  skipResult?.game.phase === GAME_PHASE.RoundResult &&
    typeof skipResult?.game.phaseEndsAt === 'number',
  skipResult?.game,
);
const skipped = await emit(skipRoom.players[0].socket, NEXT_ROUND);
check('the host skips ahead without waiting', skipped.ok === true, skipped);
await settle();
check(
  'skipping dealt the next round immediately',
  latest(skipRoom.players[0].socket)?.game.roundNumber === 2,
  latest(skipRoom.players[0].socket)?.game,
);
skipRoom.players.forEach((player) => player.socket.disconnect());

// --------------------------------------------------------------------------
log('\n13. pausing stops the clock');
const stopRoom = await makeRoom(3);
await emit(stopRoom.players[0].socket, START_GAME);
await settle();
check(
  'clock running before the pause',
  latest(stopRoom.players[1].socket)?.game.phaseEndsAt !== null,
);
stopRoom.players[2].socket.disconnect();
await settle();
const stopped = latest(stopRoom.players[1].socket);
check(
  'a paused game has no deadline left',
  stopped?.game.phase === GAME_PHASE.Paused && stopped?.game.phaseEndsAt === null,
  stopped?.game,
);
check(
  'and no duration either',
  stopped?.game.phaseDurationMs === null,
  stopped?.game,
);
stopRoom.players.forEach((player) => player.socket.disconnect());

// --------------------------------------------------------------------------
log('\n14. arming every expiry (one wait covers them all)');

// A four-player game whose judge walks away mid-round.
const abandoned = await makeRoom(4);
await emit(abandoned.players[0].socket, START_GAME);
await settle();
const abandonedJudgeId = latest(abandoned.players[1].socket)?.game.judgeId;
check('the judge is the first player', abandonedJudgeId === abandoned.players[0].id);
abandoned.players[0].socket.disconnect();
await settle();
const judgeInGrace = latest(abandoned.players[1].socket);
check(
  'a dropped judge keeps the round alive while in grace',
  judgeInGrace?.game.judgeId === abandonedJudgeId &&
    judgeInGrace?.game.phase !== GAME_PHASE.Paused,
  judgeInGrace?.game,
);

// A host in grace with two other players, to prove promotion.
const promote = await makeRoom(3);
promote.players[0].socket.disconnect();

// A single player, to prove the room outlives their grace period.
const soloId = randomUUID();
const solo = await connect();
const soloRoom = (
  await emit(solo, CREATE_ROOM, { playerId: soloId, nickname: 'Solo', locale: LOCALE })
).data.room.code;
solo.disconnect();
await settle();

const probe = await connect();
const probeJoin = await emit(probe, JOIN_ROOM, {
  playerId: randomUUID(),
  code: soloRoom,
  nickname: 'Probe',
});
check('room survives while its last player is in grace', probeJoin.ok === true, probeJoin);
await emit(probe, LEAVE_ROOM);
await settle();


// Selecting runs out with some plays in: the slow players are skipped.
const partialRoom = await makeRoom(4);
await emit(partialRoom.players[0].socket, START_GAME);
await settle();
const partialPlayers = nonJudgePlayers(partialRoom);
await playOne(partialPlayers[0]);
await playOne(partialPlayers[1]);
await settle();
check(
  'two of three have played, still selecting',
  latest(partialRoom.players[0].socket)?.game.phase === GAME_PHASE.Selecting,
);

// Selecting runs out with too little to judge between.
const lonelyRoom = await makeRoom(4);
await emit(lonelyRoom.players[0].socket, START_GAME);
await settle();
await playOne(nonJudgePlayers(lonelyRoom)[0]);
await settle();

// Judging runs out with nobody judging.
const unjudgedRoom = await makeRoom(3);
await emit(unjudgedRoom.players[0].socket, START_GAME);
await settle();
await everyonePlays(unjudgedRoom, unjudgedRoom.players);
check(
  'judging is open and nobody will touch it',
  latest(unjudgedRoom.players[0].socket)?.game.phase === GAME_PHASE.Judging,
);

log(`     waiting ${SELECTING_DURATION_MS}ms for the round and grace clocks...`);
await wait(
  Math.max(RECONNECT_GRACE_PERIOD_MS, SELECTING_DURATION_MS) + EXPIRY_BUFFER_MS,
);

// --------------------------------------------------------------------------
log('\n15. phase expiry: skip, abandon, award');
const partial = latest(partialRoom.players[0].socket);
check(
  'the slow player was skipped and judging opened',
  partial?.game.phase === GAME_PHASE.Judging,
  partial?.game,
);
check(
  'only the plays that arrived in time are on the table',
  partial?.game.submissions.length === MIN_SUBMISSIONS_TO_JUDGE,
  partial?.game.submissions.length,
);
check(
  'the abandoned round did not advance the round number',
  partial?.game.roundNumber === 1,
  partial?.game,
);
partialRoom.players.forEach((player) => player.socket.disconnect());

const lonely = latest(lonelyRoom.players[0].socket);
check(
  'too few plays throws the round away and deals another',
  lonely?.game.phase === GAME_PHASE.Selecting && lonely?.game.roundNumber === 2,
  lonely?.game,
);
check(
  'the redeal starts with a clean table',
  lonely?.game.submissions.length === 0,
  lonely?.game,
);
lonelyRoom.players.forEach((player) => player.socket.disconnect());

// Judging expired, awarded at random, then the result clock dealt on by itself.
const unjudgedHistory = unjudgedRoom.players[0].socket.states;
const decided = unjudgedHistory.find(
  (snapshot) =>
    snapshot.game.phase === GAME_PHASE.RoundResult &&
    snapshot.game.roundWinnerId !== null,
);
check('an unjudged round was awarded anyway', decided !== undefined, {
  phases: unjudgedHistory.map((h) => h.game.phase),
});
check(
  'the winner was one of the plays on the table',
  decided !== undefined &&
    decided.game.submissions.some(
      (submission) => submission.playerId === decided.game.roundWinnerId,
    ),
  decided?.game.roundWinnerId,
);
check(
  'the awarded player actually scored',
  decided !== undefined &&
    findPlayer(decided, decided.game.roundWinnerId)?.score === 1,
  decided?.players,
);
check(
  'the round result dealt on without the host',
  latest(unjudgedRoom.players[0].socket)?.game.roundNumber === 2,
  latest(unjudgedRoom.players[0].socket)?.game,
);
unjudgedRoom.players.forEach((player) => player.socket.disconnect());

// --------------------------------------------------------------------------
log('\n16. grace expiry: abandon, promote, close');
const afterJudgeLeft = latest(abandoned.players[1].socket);
check(
  'the round was abandoned and a new one dealt',
  afterJudgeLeft?.game.roundNumber === 2 &&
    afterJudgeLeft?.game.phase === GAME_PHASE.Selecting,
  afterJudgeLeft?.game,
);
check(
  'the next player took over judging',
  afterJudgeLeft?.game.judgeId === abandoned.players[1].id,
  afterJudgeLeft?.game,
);
check('the expired judge is gone', afterJudgeLeft?.players.length === 3, afterJudgeLeft?.players);
check(
  'the new judge holds no cards from the abandoned round',
  abandoned.players[1].socket.hand?.submitted.length === 0,
  abandoned.players[1].socket.hand,
);

const afterPromotion = latest(promote.players[1].socket);
check('a new host was promoted', afterPromotion?.hostId === promote.players[1].id, afterPromotion);
check('the expired player is gone for good', afterPromotion?.players.length === 2, afterPromotion?.players);

const gone = await connect();
const goneJoin = await emit(gone, JOIN_ROOM, {
  playerId: randomUUID(),
  code: soloRoom,
  nickname: 'TooLate',
});
check('room is destroyed once its last seat expires', errorCode(goneJoin) === 'ROOM_NOT_FOUND', goneJoin);

// --------------------------------------------------------------------------
log('\n17. reconnect after expiry is a plain fresh join');
const late = await connect();
const lateRejoin = await emit(late, JOIN_ROOM, {
  playerId: promote.players[0].id,
  code: promote.code,
  nickname: promote.players[0].nickname,
});
check('late rejoin is accepted', lateRejoin.ok === true, lateRejoin);
check(
  'but as a new player, not the host',
  lateRejoin.ok && lateRejoin.data.room.hostId === promote.players[1].id,
  lateRejoin,
);

for (const socket of [
  ...game.players.map((player) => player.socket),
  ...abandoned.players.map((player) => player.socket),
  ...promote.players.map((player) => player.socket),
  solo,
  probe,
  gone,
  late,
]) {
  socket.disconnect();
}

log(
  `\n${
    failures.length === 0
      ? 'ALL CHECKS PASSED'
      : `${failures.length} FAILED: ${failures.join(', ')}`
  }`,
);
process.exit(failures.length === 0 ? 0 : 1);
