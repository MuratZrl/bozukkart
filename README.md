# Bozukkart

Real-time browser party game. Fill-in-the-blank, one host, everyone else on their
phone. This pass is the **skeleton only**: rooms, players, host handling. No cards,
no rounds, no scoring yet.

## Stack

| Workspace          | What it is                                              |
| ------------------ | ------------------------------------------------------- |
| `apps/api`         | NestJS 11 + socket.io gateway, port **3001**             |
| `apps/web`         | Next.js 16 App Router + Tailwind 4, port **3000**        |
| `packages/shared`  | The wire protocol: event names, payload types, zod schemas |

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

| Constant      | Event         | Payload                        | Ack data         |
| ------------- | ------------- | ------------------------------ | ---------------- |
| `CREATE_ROOM` | `room:create` | `{ playerId, nickname }`       | `RoomMembership` |
| `JOIN_ROOM`   | `room:join`   | `{ playerId, code, nickname }` | `RoomMembership` |
| `LEAVE_ROOM`  | `room:leave`  | none, on purpose               | `RoomDeparture`  |

Server to client:

| Constant     | Event        | Payload        |
| ------------ | ------------ | -------------- |
| `ROOM_STATE` | `room:state` | `RoomSnapshot` |

`room:state` is broadcast to everyone in a room on every membership change, so the
client never has to reconstruct state from deltas.

Failures come back as `{ ok: false, error: { code, message } }` where `code` is one
of `SOCKET_ERROR_CODE` — `INVALID_PAYLOAD`, `ROOM_NOT_FOUND`, `ROOM_FULL`,
`NICKNAME_TAKEN`, `ALREADY_IN_ROOM`, `NOT_IN_ROOM`, `ROOM_CODE_UNAVAILABLE`,
`INTERNAL_ERROR`, plus `NOT_CONNECTED` / `TIMEOUT` which the client produces
locally. Messages are always safe to render.

## Room rules

- Codes are 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no `I`, no `O`, so nobody
  reads them back as `1` or `0`), generated with `crypto.randomInt` and retried on
  collision.
- Rooms live in a `Map` on the API process. No database, no Redis. Restart the
  server and every room is gone; that is the intended trade for this pass.
- Max 12 players. Nicknames are unique per room, case-insensitively — a
  reconnecting player never collides with their own record.
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

A dropped socket does not remove anyone. The seat is marked disconnected, a
`RECONNECT_GRACE_PERIOD_MS` timer starts, and the new state is broadcast so the
lobby can grey the player out. Then either:

- the same `playerId` rejoins the same room in time — the record reattaches to the
  new socket, the timer is cancelled, the restored state is broadcast, and the
  player keeps host if it had it; or
- the timer expires — the player is removed for good, a new host is promoted (the
  longest-tenured player still on the line), and the room is deleted if that was
  the last seat. Rejoining after that is an ordinary fresh join.

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
upper-cased. `room:leave` deliberately takes no payload — the room a socket may
leave is derived from the connection, never from what the client claims.

The same schemas run on the client for instant form feedback. That is a convenience,
not a security boundary; the server re-validates everything.

## Layout

```
apps/api/src
  config.ts                port + CORS origins, validated at boot
  health.controller.ts     GET /health
  rooms/rooms.service.ts   the in-memory Map, lifecycle rules, grace timers
  rooms/rooms.gateway.ts   validation, acks, broadcasts, disconnect handling
  rooms/socket.types.ts    socket.io Server/Socket typed with the shared protocol
  test/smoke.mjs           end-to-end room lifecycle checks over real sockets

apps/web/src
  app/page.tsx                  landing: nickname + create / join by code
  app/room/[code]/page.tsx      validates the code param, renders the lobby
  components/bozukkart-provider  the socket singleton, connection state, room state
  components/lobby-screen.tsx   live player list, host badge, copy code, leave
  lib/player-id.ts              the persisted player identity
  lib/room-session.ts           the per-tab room this client rejoins on connect
```

The gateway holds no game state and the service holds no socket.io types, which is
what makes the next pass (rounds, hands, judging) a service-level change.

## Smoke test

`apps/api/test/smoke.mjs` drives a running API over real socket.io connections and
checks the whole room lifecycle, reconnects included. Start the API, then:

```bash
pnpm --filter @bozukkart/api smoke
```

It runs for a little over `RECONNECT_GRACE_PERIOD_MS`, because two of the scenarios
have to wait a grace period out for real.

## Notes for the next pass

- Auto-rejoin gives up after one refused attempt. If you want it to survive an API
  restart it would need to retry on a later reconnect rather than clearing the
  session on the first rejection.
- `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` are generated by Next 16 on every
  dev boot. Set `agentRules: false` in `next.config.ts` if you would rather not
  have them.
