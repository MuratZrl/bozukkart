# Punchline

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

| Constant      | Event          | Payload                  | Ack data         |
| ------------- | -------------- | ------------------------ | ---------------- |
| `CREATE_ROOM` | `room:create`  | `{ nickname }`           | `RoomMembership` |
| `JOIN_ROOM`   | `room:join`    | `{ code, nickname }`     | `RoomMembership` |
| `LEAVE_ROOM`  | `room:leave`   | none, on purpose         | `RoomDeparture`  |

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
- Max 12 players. Nicknames are unique per room, case-insensitively.
- A socket can be in exactly one room.
- On leave **or** disconnect: the player is removed, a new host is promoted (the
  longest-tenured remaining player) if the host was the one who left, and the room
  is deleted when the last player goes.

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
  rooms/rooms.service.ts   the in-memory Map, all lifecycle rules, no socket types
  rooms/rooms.gateway.ts   validation, acks, broadcasts, disconnect handling
  rooms/socket.types.ts    socket.io Server/Socket typed with the shared protocol

apps/web/src
  app/page.tsx                  landing: nickname + create / join by code
  app/room/[code]/page.tsx      validates the code param, renders the lobby
  components/punchline-provider  the socket singleton, connection state, room state
  components/lobby-screen.tsx   live player list, host badge, copy code, leave
```

The gateway holds no game state and the service holds no socket.io types, which is
what makes the next pass (rounds, hands, judging) a service-level change.

## Notes for the next pass

- Reconnects get a fresh socket id, so the lobby asks you to rejoin. If you want
  real reconnection, give each player a client-generated id and key the room `Map`
  on that instead of on `socket.id`.
- `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` are generated by Next 16 on every
  dev boot. Set `agentRules: false` in `next.config.ts` if you would rather not
  have them.
