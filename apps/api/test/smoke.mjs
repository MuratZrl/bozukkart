/**
 * End-to-end smoke test for the room lifecycle. Drives a running API over real
 * socket.io connections; there is no mocking here on purpose.
 *
 *   pnpm --filter @bozukkart/api start      (or pnpm dev)
 *   pnpm --filter @bozukkart/api smoke
 *
 * Runs for roughly RECONNECT_GRACE_PERIOD_MS + a few seconds, because two of the
 * scenarios have to actually wait a grace period out.
 */
import { randomUUID } from 'node:crypto';

import {
  CREATE_ROOM,
  JOIN_ROOM,
  LEAVE_ROOM,
  MAX_PLAYERS_PER_ROOM,
  RECONNECT_GRACE_PERIOD_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_STATE,
} from '@bozukkart/shared';
import { io } from 'socket.io-client';

const URL = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const ACK_TIMEOUT_MS = 5_000;
/** Slack after a grace period so the server's timer definitely fired. */
const EXPIRY_BUFFER_MS = 2_500;

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
    socket.on(ROOM_STATE, (room) => socket.states.push(room));
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

// --------------------------------------------------------------------------
log('\n1. create room');
const hostId = randomUUID();
const host = await connect();
const created = await emit(host, CREATE_ROOM, {
  playerId: hostId,
  nickname: '  Dave  ',
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
  'player id is the identity, not the socket id',
  created.ok && created.data.room.players[0].id === hostId,
  created,
);
check(
  'nickname trimmed by zod',
  created.ok && created.data.room.players[0].nickname === 'Dave',
  created,
);
check('creator is host', created.ok && created.data.room.hostId === hostId);
check(
  'creator starts connected',
  created.ok && created.data.room.players[0].connected === true,
);
check('creator got a room:state broadcast', host.states.length === 1);

// --------------------------------------------------------------------------
log('\n2. validation (never trust the client)');
const guestId = randomUUID();
const guest = await connect();

const noPlayerId = await emit(guest, JOIN_ROOM, { code, nickname: 'Guest' });
check(
  'missing playerId rejected',
  !noPlayerId.ok && noPlayerId.error.code === 'INVALID_PAYLOAD',
  noPlayerId,
);
const badPlayerId = await emit(guest, JOIN_ROOM, {
  playerId: 'not-a-uuid',
  code,
  nickname: 'Guest',
});
check(
  'non-uuid playerId rejected',
  !badPlayerId.ok && badPlayerId.error.code === 'INVALID_PAYLOAD',
  badPlayerId,
);
const badNick = await emit(guest, JOIN_ROOM, {
  playerId: guestId,
  code,
  nickname: 'x',
});
check(
  'short nickname rejected',
  !badNick.ok && badNick.error.code === 'INVALID_PAYLOAD',
  badNick,
);
const badCode = await emit(guest, JOIN_ROOM, {
  playerId: guestId,
  code: '12',
  nickname: 'Guest',
});
check(
  'bad code rejected',
  !badCode.ok && badCode.error.code === 'INVALID_PAYLOAD',
  badCode,
);
const extraKey = await emit(guest, JOIN_ROOM, {
  playerId: guestId,
  code,
  nickname: 'Guest',
  isHost: true,
});
check(
  'unknown key rejected (strictObject)',
  !extraKey.ok && extraKey.error.code === 'INVALID_PAYLOAD',
  extraKey,
);
const notObject = await emit(guest, CREATE_ROOM, 'just a string');
check(
  'non-object payload rejected',
  !notObject.ok && notObject.error.code === 'INVALID_PAYLOAD',
  notObject,
);
const missing = await emit(guest, JOIN_ROOM, {
  playerId: guestId,
  code: 'ZZZZ',
  nickname: 'Guest',
});
check(
  'unknown room rejected',
  !missing.ok && missing.error.code === 'ROOM_NOT_FOUND',
  missing,
);

// --------------------------------------------------------------------------
log('\n3. join and leave');
const joined = await emit(guest, JOIN_ROOM, {
  playerId: guestId,
  code: code.toLowerCase(),
  nickname: 'Guest',
});
check('join acked ok (lowercase code normalised)', joined.ok === true, joined);
check('guest is not host', joined.ok && joined.data.room.hostId === hostId);
check('room reports its cap', joined.ok && joined.data.room.maxPlayers === MAX_PLAYERS_PER_ROOM);
await settle();
check('host was told about the join', latest(host)?.players.length === 2, latest(host));

const secondRoom = await emit(guest, CREATE_ROOM, {
  playerId: guestId,
  nickname: 'Guest',
});
check(
  'a connected player cannot hold a second seat',
  !secondRoom.ok && secondRoom.error.code === 'ALREADY_IN_ROOM',
  secondRoom,
);

const carolId = randomUUID();
const carol = await connect();
const dupe = await emit(carol, JOIN_ROOM, {
  playerId: carolId,
  code,
  nickname: 'guest',
});
check(
  'duplicate nickname rejected (case-insensitive)',
  !dupe.ok && dupe.error.code === 'NICKNAME_TAKEN',
  dupe,
);

const carolJoin = await emit(carol, JOIN_ROOM, {
  playerId: carolId,
  code,
  nickname: 'Carol',
});
check('third player joined', carolJoin.ok === true, carolJoin);
await settle();

const left = await emit(carol, LEAVE_ROOM);
check(
  'explicit leave removes immediately, no grace',
  left.ok === true && left.data.code === code && left.data.roomClosed === false,
  left,
);
await settle();
check(
  'remaining players see the departure',
  latest(host)?.players.length === 2,
  latest(host),
);
check(
  'a deliberate leaver is gone, not greyed out',
  findPlayer(latest(host), carolId) === undefined,
  latest(host),
);
const leaveAgain = await emit(carol, LEAVE_ROOM);
check(
  'leaving when not in a room rejected',
  !leaveAgain.ok && leaveAgain.error.code === 'NOT_IN_ROOM',
  leaveAgain,
);

// --------------------------------------------------------------------------
log('\n4. disconnect starts a grace period instead of removing');
host.disconnect();
await settle();

const duringGrace = latest(guest);
check('the seat is kept', duringGrace?.players.length === 2, duringGrace);
check(
  'the dropped player is flagged disconnected',
  findPlayer(duringGrace, hostId)?.connected === false,
  duringGrace,
);
check(
  'everyone else stays connected',
  findPlayer(duringGrace, guestId)?.connected === true,
  duringGrace,
);
check('host keeps the host seat while in grace', duringGrace?.hostId === hostId);

// --------------------------------------------------------------------------
log('\n5. reconnect within grace reattaches and keeps host');
const hostAgain = await connect();
const reconnected = await emit(hostAgain, JOIN_ROOM, {
  playerId: hostId,
  code,
  nickname: 'Dave',
});
check('reconnect acked ok', reconnected.ok === true, reconnected);
check(
  'no duplicate player was created',
  reconnected.ok && reconnected.data.room.players.length === 2,
  reconnected,
);
check(
  'reconnecting player is connected again',
  reconnected.ok &&
    findPlayer(reconnected.data.room, hostId)?.connected === true,
  reconnected,
);
check(
  'host status survived the round trip',
  reconnected.ok && reconnected.data.room.hostId === hostId,
  reconnected,
);
check(
  'the original join time was kept',
  reconnected.ok &&
    findPlayer(reconnected.data.room, hostId)?.joinedAt ===
      created.data.room.players[0].joinedAt,
  reconnected,
);
await settle();
check(
  'the rest of the room saw the restore',
  findPlayer(latest(guest), hostId)?.connected === true,
  latest(guest),
);

const renamed = await emit(hostAgain, JOIN_ROOM, {
  playerId: hostId,
  code,
  nickname: 'Dave',
});
check(
  'own nickname does not collide with own record',
  renamed.ok === true,
  renamed,
);

// --------------------------------------------------------------------------
log('\n6. a second socket for the same player takes over');
const hostThirdSocket = await connect();
const takeover = await emit(hostThirdSocket, JOIN_ROOM, {
  playerId: hostId,
  code,
  nickname: 'Dave',
});
check('takeover acked ok', takeover.ok === true, takeover);
check(
  'still one player, still host',
  takeover.ok &&
    takeover.data.room.players.length === 2 &&
    takeover.data.room.hostId === hostId,
  takeover,
);
const displacedSeen = hostAgain.states.length;
await emit(guest, JOIN_ROOM, { playerId: guestId, code, nickname: 'Guest' });
await settle();
check(
  'the displaced socket stops receiving the room feed',
  hostAgain.states.length === displacedSeen,
  { before: displacedSeen, after: hostAgain.states.length },
);

// --------------------------------------------------------------------------
log('\n7. setting up two grace expiries (this waits a full grace period)');

// Room A: a host in grace with two other players, to prove promotion.
const promoteHostId = randomUUID();
const promoteGuestId = randomUUID();
const promoteHost = await connect();
const promoteGuest = await connect();
const roomA = (
  await emit(promoteHost, CREATE_ROOM, {
    playerId: promoteHostId,
    nickname: 'Boss',
  })
).data.room.code;
await emit(promoteGuest, JOIN_ROOM, {
  playerId: promoteGuestId,
  code: roomA,
  nickname: 'Second',
});

// Room B: a single player, to prove the room outlives their grace period.
const soloId = randomUUID();
const solo = await connect();
const roomB = (
  await emit(solo, CREATE_ROOM, { playerId: soloId, nickname: 'Solo' })
).data.room.code;

promoteHost.disconnect();
solo.disconnect();
await settle();

check(
  'host in grace is still the host',
  latest(promoteGuest)?.hostId === promoteHostId,
  latest(promoteGuest),
);

const probe = await connect();
const probeJoin = await emit(probe, JOIN_ROOM, {
  playerId: randomUUID(),
  code: roomB,
  nickname: 'Probe',
});
check(
  'room survives while its last player is in grace',
  probeJoin.ok === true,
  probeJoin,
);
check(
  'the graced player is still in it, greyed out',
  probeJoin.ok && findPlayer(probeJoin.data.room, soloId)?.connected === false,
  probeJoin,
);
await emit(probe, LEAVE_ROOM);
await settle();

log(`     waiting ${RECONNECT_GRACE_PERIOD_MS}ms for the grace timers...`);
await wait(RECONNECT_GRACE_PERIOD_MS + EXPIRY_BUFFER_MS);

// --------------------------------------------------------------------------
log('\n8. grace expiry removes, promotes and closes');
const afterExpiry = latest(promoteGuest);
check(
  'the expired player is gone for good',
  afterExpiry?.players.length === 1,
  afterExpiry,
);
check(
  'a new host was promoted',
  afterExpiry?.hostId === promoteGuestId,
  afterExpiry,
);
check(
  'the promoted player is flagged isHost',
  findPlayer(afterExpiry, promoteGuestId)?.isHost === true,
  afterExpiry,
);

const roomBGone = await connect();
const roomBJoin = await emit(roomBGone, JOIN_ROOM, {
  playerId: randomUUID(),
  code: roomB,
  nickname: 'TooLate',
});
check(
  'room is destroyed once its last seat expires',
  !roomBJoin.ok && roomBJoin.error.code === 'ROOM_NOT_FOUND',
  roomBJoin,
);

// --------------------------------------------------------------------------
log('\n9. reconnect after expiry is a plain fresh join');
const tooLate = await connect();
const lateRejoin = await emit(tooLate, JOIN_ROOM, {
  playerId: promoteHostId,
  code: roomA,
  nickname: 'Boss',
});
check('late rejoin is accepted', lateRejoin.ok === true, lateRejoin);
check(
  'but as a new player, not the host',
  lateRejoin.ok && lateRejoin.data.room.hostId === promoteGuestId,
  lateRejoin,
);
check(
  'and the room counts them fresh',
  lateRejoin.ok && lateRejoin.data.room.players.length === 2,
  lateRejoin,
);

for (const socket of [
  host,
  hostAgain,
  hostThirdSocket,
  guest,
  carol,
  promoteHost,
  promoteGuest,
  solo,
  probe,
  roomBGone,
  tooLate,
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
