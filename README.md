# Bozukkart

Real-time browser party game. Fill-in-the-blank, one host, everyone else on their
phone. Rooms, reconnects, and a full round loop: deal, play, judge, score. Nothing
runs on a clock — every phase change is a button somebody presses.

## Stack

| Workspace          | What it is                                              |
| ------------------ | ------------------------------------------------------- |
| `apps/api`         | NestJS 11 + socket.io gateway, port **3001**             |
| `apps/web`         | Next.js 16 App Router + Tailwind 4, port **3000**        |
| `packages/shared`  | The wire protocol: event names, payload types, zod schemas, decks, strings |

pnpm workspace, TypeScript strict everywhere (`noUncheckedIndexedAccess`,
`noUnusedLocals`, `noImplicitReturns`, the lot).

## Running it

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` builds `packages/shared` once, then runs all three workspaces in
parallel: `tsc --watch` on shared, `nest start --watch` on the API, `next dev` on
the web app. Works from PowerShell; no shell-specific syntax in any script.

Other scripts: `pnpm build`, `pnpm typecheck`, `pnpm clean`.

Environment (all optional, all defaulted):

| Variable              | Default                 | Used by |
| --------------------- | ----------------------- | ------- |
| `PORT`                | `3001`                  | api     |
| `WEB_ORIGIN`          | `http://localhost:3000` | api (CORS allow-list, comma-separated) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | web     |

## The protocol

Every event name, payload type and validation rule lives in `packages/shared` and
is imported by both apps. There are no event-name string literals and no duplicated
payload interfaces in `apps/*` — rename a constant and the other side fails to
compile.

Client to server (all acknowledged with a `SocketResult<T>`):

| Constant       | Event              | Payload                                       | Ack data           |
| -------------- | ------------------ | --------------------------------------------- | ------------------ |
| `CREATE_ROOM`  | `room:create`      | `{ playerId, nickname, locale, targetScore? }` | `RoomMembership`   |
| `JOIN_ROOM`    | `room:join`        | `{ playerId, code, nickname }`                 | `RoomMembership`   |
| `LEAVE_ROOM`   | `room:leave`       | none, on purpose                               | `RoomDeparture`    |
| `START_GAME`   | `game:start`       | none, on purpose                               | `GameActionResult` |
| `SUBMIT_CARDS` | `game:submit`      | `{ cardIds }`                                  | `GameActionResult` |
| `PICK_WINNER`  | `game:pick-winner` | `{ submissionId }`                             | `GameActionResult` |
| `NEXT_ROUND`   | `game:next-round`  | none, on purpose                               | `GameActionResult` |

Server to client:

| Constant     | Event        | Payload        | Sent to        |
| ------------ | ------------ | -------------- | -------------- |
| `ROOM_STATE` | `room:state` | `RoomSnapshot` | the whole room |
| `HAND_STATE` | `hand:state` | `HandSnapshot` | one socket     |

`room:state` is broadcast on every change, so the client never has to reconstruct
state from deltas. `hand:state` is the only thing addressed to a single socket, and
the only place a player's cards ever appear.

Failures come back as `{ ok: false, error: { code, key, params } }`. `code` is one of
`SOCKET_ERROR_CODE`; `key` is a dictionary key the client renders itself. See
**Strings** below.

## The round loop

`lobby -> selecting -> judging -> roundResult -> ...`, with `paused` and `gameOver`
hanging off the side. Nothing advances on a timer:

- **lobby** — the host starts the game. Needs `MIN_PLAYERS_TO_START` (3) connected.
- **selecting** — the judge rotates to the next connected player in join order, a
  prompt is drawn, and every non-judge is dealt back up to `HAND_SIZE` (10). Each
  non-judge plays exactly `prompt.pick` cards; the judge plays none. Judging opens
  once the last connected non-judge has played, which is a player action, not a clock.
- **judging** — plays are shuffled and shown without owners. Only the judge picks.
- **roundResult** — the winner takes a point and every play is attributed. The host
  deals the next round.
- **gameOver** — somebody reached `targetScore` (default 7). The host can start a
  rematch, which resets scores and reshuffles the deck.
- **paused** — fewer than 3 players are connected. The round goes back in the box and
  scores are kept; the host deals again once enough people are back.

`paused` is a sixth phase rather than a flag on `lobby` so the UI can tell "the game
never started" apart from "the game is waiting for you".

## Who may see what

- A hand only ever goes to its owner's socket, over `hand:state`. The room snapshot
  contains no card contents at all.
- `SubmissionView.playerId` is `null` for the whole of `judging` and is filled in only
  once the round is decided. The owner map never leaves the server before then.
- `awaitingPlayerIds` says who still owes a play — a name, never a card.
- Every move is checked server-side: the sender's seat is resolved from their socket
  and never from anything they send, the phase must allow the action, the judge is the
  only one who may pick a winner and the only one who may not play, and every submitted
  card is verified to be in that player's hand in the right quantity.

## Cards and locales

A room takes a `locale` at creation and only ever draws from that locale's deck.
`packages/shared/src/decks` ships a placeholder deck per locale: 30 prompts and 60
answers each — enough to play, nowhere near enough to be funny twice. Prompt cards
carry a `pick` count and mark blanks with `___`.

Sixty answer cards is fewer than twelve players holding ten each, so at high player
counts the draw pile can run dry. Discards are reshuffled first, and if everything
really is in a hand the deal comes up short rather than failing the round. Real decks
fix this.

## Strings

Nothing user-facing is hardcoded, on either side. Every string is a key in
`packages/shared/src/i18n.ts` with an entry per locale, rendered by
`translate(locale, key, params)`. The server never sends prose: errors travel as
`{ code, key, params }` and the client renders them in whatever locale it is showing,
which is the only way a Turkish room can report an error to a reader whose browser is
in English. Even zod carries dictionary keys in its message slot, so a rejected
payload comes back translatable.

The client picks its locale from storage, then the browser, then the default — but a
room's own locale wins for everyone in it.

## Room rules

- Codes are 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no `I`, no `O`, so nobody
  reads them back as `1` or `0`), generated with `crypto.randomInt` and retried on
  collision.
- Rooms live in a `Map` on the API process. No database, no Redis. Restart the
  server and every room is gone; that is the intended trade for this pass.
- Max 12 players, minimum 3 to deal a round. Nicknames are unique per room,
  case-insensitively — a reconnecting player never collides with their own record.
- A player can be in exactly one room. A seat they are actively connected to
  blocks a second one; a seat they are only lingering in behind a grace timer is
  dropped so they can move on.
- **Leaving** is final: the player is removed at once, a new host is promoted if
  the host was the one who left, and the room is deleted when the last seat goes.
- **Disconnecting** is not. See below.

## Identity and reconnects

Players are identified by a `playerId` the browser generates once and keeps in
local storage, not by `socket.id`. Each server-side player record carries whatever
socket currently speaks for it, and that socket is swapped out on reconnect. The
host is tracked by player id, so it survives one too.

A dropped socket does not remove anyone. The seat — with its hand, its score and any
play already made — is marked disconnected, a `RECONNECT_GRACE_PERIOD_MS` timer
starts, and the new state is broadcast so the lobby can grey the player out. Then
either:

- the same `playerId` rejoins the same room in time — the record reattaches to the
  new socket, the timer is cancelled, the hand is redelivered, and the player keeps
  host if it had it; or
- the timer expires — the player is removed for good, their cards go back in the box,
  a new host is promoted (preferring someone actually connected), and the room is
  deleted if that was the last seat. Rejoining after that is an ordinary fresh join.

If the player who expires was the round's judge, the round is abandoned and a new one
is dealt with the next judge, because nobody else can decide it.

Every timer is cleared when a player is removed, when a room is destroyed and on
module shutdown, and the timers are `unref`'d so a pending grace period can never
hold the process open.

The client rejoins on its own. On a successful create or join the tab records the
room code and its settled nickname in **session** storage, and every time the
socket connects — a reconnect or the first connect after a reload — it replays that
as a join with the stored `playerId`. The lobby shows a connecting state for as
long as that is in flight and only falls back to the rejoin form if the server
refuses, in which case it shows the reason and forgets the session. Leaving clears
it too, so a tab never crawls back into a room somebody walked out of.

Session storage rather than local storage is deliberate: it is per tab, so opening
a second tab lands on the landing page instead of auto-rejoining the first tab's
room and taking the seat over.

The `playerId` is identity, not a credential. Anyone can send any id; it only ever
matches a seat the server already put in a room, and it grants nothing on its own.

## Validating input

Every inbound payload is parsed server-side with the zod schemas in
`packages/shared/src/schemas.ts` before it reaches any room logic. Objects are
strict, so unknown keys are rejected rather than ignored. Nicknames are trimmed,
whitespace-collapsed and stripped of control characters; room codes are trimmed and
upper-cased. `room:leave`, `game:start` and `game:next-round` deliberately take no
payload — what they act on is derived from the connection, never from what the
client claims.

The same schemas run on the client for instant form feedback. That is a convenience,
not a security boundary; the server re-validates everything.

## Layout

```
apps/api/src
  config.ts                port + CORS origins, validated at boot
  health.controller.ts     GET /health
  rooms/rooms.service.ts   the in-memory Map, round state machine, grace timers
  rooms/rooms.gateway.ts   validation, acks, broadcasts, disconnect handling
  rooms/deck.ts            per-room draw and discard piles
  rooms/socket.types.ts    socket.io Server/Socket typed with the shared protocol
  test/smoke.mjs           end-to-end room and round checks over real sockets

apps/web/src
  app/page.tsx                   landing: locale, nickname, create / join by code
  app/room/[code]/page.tsx       validates the code param, renders the lobby
  components/bozukkart-provider  socket singleton, connection, room and hand state
  components/lobby-screen.tsx    player list, scores, copy code, leave
  components/game-board.tsx      phase orchestration
  components/hand-view.tsx       the private hand and the pick being built
  components/submission-list.tsx the plays, owned or anonymous
  components/prompt-view.tsx     a prompt with its blanks filled or empty
  lib/player-id.ts               the persisted player identity
  lib/room-session.ts            the per-tab room this client rejoins on connect
```

The game components are deliberately unstyled: semantic markup, semantic class names,
no colours, no layout, no inline styles. They will look plain next to the lobby and
landing page, which were styled in an earlier pass, until styling lands.

The gateway holds no game state and the service holds no socket.io types, so the deck,
the phases and the scoring are all reachable without touching the transport.

## Smoke test

`apps/api/test/smoke.mjs` drives a running API over real socket.io connections and
checks the whole room and round lifecycle. Start the API, then:

```bash
pnpm --filter @bozukkart/api smoke
```

It covers the happy-path round, judge and host permissions, playing a card you do not
hold, acting in the wrong phase, reaching the target score, dropping below the
minimum, a judge who abandons a round, host promotion and room destruction. It runs
for a little over `RECONNECT_GRACE_PERIOD_MS`, because the expiry scenarios have to
wait a grace period out for real.

## Known trade-offs

- A player refreshing in a three-player game drops the connected count below the
  minimum, which pauses the game and returns that round to the deck. Scores and seats
  survive and the host deals again, but pausing on *connected* count is blunt for
  small games.
- The judge dropping does not abandon the round until their grace period expires, so
  a game can sit in `judging` for up to 30 seconds waiting on someone who is not
  coming back.

## Notes for the next pass

- Auto-rejoin gives up after one refused attempt. If you want it to survive an API
  restart it would need to retry on a later reconnect rather than clearing the
  session on the first rejection.
- `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` are generated by Next 16 on every
  dev boot. Set `agentRules: false` in `next.config.ts` if you would rather not
  have them.
