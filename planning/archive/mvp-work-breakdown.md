# MVP Work Breakdown

Feature-sized units of work for implementing the MVP described in
[project-spec.md](project-spec.md) and [data-models.md](data-models.md), on top of
the repo scaffold already in place (`shared/`, `server/`, `client/`, Docker, `cards/`
sample content).

Units are ordered so each one is implementable and testable on its own, without
forward references to a unit that hasn't landed yet. Dependencies are called out
explicitly. Suggested file locations follow the structure in `AGENTS.md`.

Each unit should land as its own PR/commit series where practical.

`AGENTS.md` is the governing architecture document. Where the older
`project-spec.md` catalog examples conflict with `AGENTS.md` and `data-models.md`,
use opaque string IDs, derive the initial display name from the filename, and
reject duplicate IDs. Unit 1 includes bringing those older examples back into
alignment before catalog implementation begins.

Every unit that introduces server-side domain behavior should include focused
automated tests for its success, rejection, and invariant-preservation paths.
Manual browser checks supplement these tests; they do not replace them.
Every command schema is added to the shared package when its command is
introduced. Position-bearing payloads must use finite-number schemas immediately;
domain operations must also enforce the common world-coordinate bounds.

---

## Phase 1 — Catalog & Read-Only Table

### 1. Card catalog loader

Load and validate `cards/*.jpg|png` + `cards/*.json` pairs into an in-memory catalog at server startup.

* First reconcile the conflicting catalog examples in `project-spec.md` with
  `AGENTS.md` and `data-models.md` so there is one documented contract.
* Shared Zod source schema for the minimum card JSON (`id: string`, `type: string`,
  `body: string`), preserving unknown extra fields. `name` is derived from the
  filename stem; a JSON `name` is not required.
* Define shared `CardDefinition`, `CardCatalogResponse`, ID aliases, and protocol
  constants used by both server and client.
* Match files by stem; validate image format (jpg/png), square dimensions 32–512px.
* Clear, aggregated startup errors for: orphaned JSON, orphaned image, malformed JSON, missing required fields, bad types, unsupported/invalid image dimensions.
* Reject duplicate definition IDs with an aggregated error. Filename-derived
  display names need not be unique.
* Files: `shared/src/cards.ts`, `shared/src/ids.ts`,
  `server/src/cards/load-card-catalog.ts`.

**Depends on:** nothing (builds on existing scaffold).
**Done when:** automated fixture tests cover valid cards, missing pairs, malformed
JSON, invalid image dimensions, and duplicate IDs; the server fails with an
aggregated message for broken fixtures and starts cleanly with the sample cards,
exposing a typed read-only `CardCatalog` in memory.

---

### 2. Card catalog HTTP API

Expose the loaded catalog over HTTP.

* `GET /api/cards` → `{ cards: CardDefinition[] }`, including `imageUrl` pointing at the already-working `/cards/*` static route.
* Card art must render with nearest-neighbor scaling client-side when displayed off-resolution (note for unit 5, not implemented here).
* Files: `server/src/http/routes.ts`, wired into `server/src/index.ts`.

**Depends on:** Unit 1.
**Done when:** `curl /api/cards` returns the full sample catalog with correct `imageUrl`s.

---

### 3. Minimal room state + connection lifecycle

Stand up the real `TableRoom` state shape (no mutation commands yet) and player join/leave.

* Colyseus Schema classes for `RoomState`, `Player`, and `CardInstance` per
  `data-models.md` §6, §11, §15 (cards map can start empty — no spawning yet).
  Host authority is deliberately omitted until Unit 16 and will be represented by
  canonical room metadata rather than a duplicated player flag.
* On join: generate a `PlayerId` independent of the Colyseus `sessionId`, create a
  `Player` with a validated client-supplied display name, and add it to state.
* Keep connection/session lookup separate from player identity so reconnection can
  later restore a player without changing the room-state model.
* On leave/disconnect in this unit: mark disconnected and remove the player. Unit
  17 replaces immediate removal with a bounded reconnection grace period.
* Files: `server/src/rooms/TableRoom.ts`, new `server/src/rooms/state/RoomState.ts`.

**Depends on:** nothing new (parallel to Units 1–2).
**Done when:** two client connections joining a room see each other appear/disappear in synchronized state (verifiable via a throwaway script or the Colyseus monitor, no UI needed yet).

---

### 4. Card browser UI

Read-only browser listing the catalog, no table yet.

* Fetches `GET /api/cards`, renders name/type/body per card, shows art with nearest-neighbor scaling.
* Client-side sort/filter by `name`, `id`, `type`.
* Collapsible/pop-out panel per spec §6.
* Import `CardDefinition` and `CardCatalogResponse` from the shared package rather
  than defining client-local copies.
* Files: `client/src/features/card-browser/`.

**Depends on:** Unit 2.
**Done when:** browser shows all sample cards and sorting/filtering works, verified in the running dev app.

---

### 5. Tabletop rendering shell

Static Konva tabletop that can render a card, but no interactivity yet.

* `Table.tsx`: green play surface sized to its container, with explicit conversion
  between screen/viewport coordinates and stable world coordinates.
* `Card.tsx` / `CardRenderer.tsx`: art on top ~50%, body text below, text shrinks to a minimum size then clips overflow. Deterministic, pure function of `CardDefinition` + instance face/orientation.
* Face-down cards render a generic card-back.
* Files: `client/src/tabletop/Table.tsx`, `client/src/tabletop/Card.tsx`, `client/src/cards/CardRenderer.tsx`.

**Depends on:** Unit 4 (reuses `CardDefinition` types), not on Unit 3.
**Done when:** a hardcoded local card instance (no server data) renders correctly face-up and face-down, at multiple text lengths, in Storybook-less manual testing in the dev app.

---

## Phase 2 — Core Card Manipulation

### 6. Spawn card end-to-end

Wire the browser to the table through the server for the first time.

* `SPAWN_CARD` command: Zod payload validation, domain function `spawnCard()` (`server/src/commands/card/spawn-card.ts`), inserts a standalone face-up upright `CardInstance` at top z-index.
* Client: drag from card browser onto table → send `SPAWN_CARD` → render resulting synchronized card.
* Files: `server/src/commands/card/spawn-card.ts`, `shared/src/commands.ts` (add `SPAWN_CARD` + payload schema), `client/src/multiplayer/commands.ts`.
* Validate that `definitionId` exists in the server catalog. Validate coordinates
  structurally as finite numbers and enforce a documented, generous world bound
  in the domain operation.

**Depends on:** Units 1–5.
**Done when:** dragging a card from the browser onto the table in two browser tabs shows the new card to both.

---

### 7. Object locks (claim/release)

Temporary ownership so only one player manipulates an object at a time.

* `CLAIM_OBJECT` / `RELEASE_OBJECT` domain functions with idempotent re-claim by the same player, rejection for a different owner, timeout-based auto-release, and release on disconnect.
* No visible client behavior change yet beyond internal wiring — surfaced in Unit 8.
* Files: `server/src/commands/player/claim-object.ts`, `server/src/commands/player/release-object.ts`.

**Depends on:** Unit 3.
**Done when:** a scripted test (two fake clients) shows claim/reject/release/timeout/disconnect-release behavior.

---

### 8. Card dragging (move)

Make cards draggable with the full claim → move → release protocol from spec §10.1.

* Client: pointer-down claims, local drag renders immediately, throttled `MOVE_CARD` at ~20Hz, final position sent on pointer-up, then release. Revert on claim rejection.
* Server: `moveCard()` domain function — reject if card belongs to a stack or sender doesn't hold the lock.
* Remote clients interpolate incoming positions.
* Files: `server/src/commands/card/move-card.ts`, `client/src/tabletop/interactions/drag.ts`.

**Depends on:** Units 6, 7.
**Done when:** dragging a spawned card is visually immediate locally and appears (smoothly) on a second connected client; a second client cannot simultaneously drag the same card.

---

### 9. Flip / tap / untap

* `FLIP_CARD`, `TAP_CARD`, `UNTAP_CARD` domain functions and commands; idempotent tap/untap.
* Client interactions (e.g. double-click to flip, keyboard/right-click to tap) plus visual rotation for tapped state.
* Files: `server/src/commands/card/{flip-card,tap-card,untap-card}.ts`.

**Depends on:** Unit 6.
**Done when:** flip/tap/untap on a standalone card is synchronized across two clients.

---

### 10. Bring to front / z-index

* `BRING_TO_FRONT` domain function (`zIndex = max + 1`); claiming/dragging an object implicitly brings it to front.
* Files: `server/src/commands/card/bring-to-front.ts`, small hook into `move-card.ts`.

**Depends on:** Unit 8.
**Done when:** dragging a card visually layers it above others; overlapping cards have deterministic, server-driven stacking order.

---

### 11. Magnify preview

Local-only magnified view, per spec §7.4 — does not touch server state.

* Hover/right-click/double-click (pick one primary interaction) shows a 2–4× preview overlay.
* Files: `client/src/features/tabletop/MagnifyPreview.tsx`, local UI state only (`client/src/state/local-ui-state.ts`).

**Depends on:** Unit 5.
**Done when:** magnify works on any rendered card without affecting its tabletop size/state and without any network traffic.

---

### 12. Delete card

* `DELETE_CARD` domain function for standalone cards only. Reject any card with a
  non-null `stackId`; stacked-card deletion is added atomically in Unit 15 after
  stack invariants exist.
* Client interaction: context-menu action or trash-target drop.
* Files: `server/src/commands/card/delete-card.ts`.

**Depends on:** Unit 6.
**Done when:** deleting a standalone card removes it for all connected clients;
tests show that unknown IDs and any card marked as stacked are rejected without
partial mutation.

---

## Phase 3 — Stacks

### 13. Stack data model & invariants

* `CardStack` Schema (`id`, `x`, `y`, `cardIds` bottom→top, `zIndex`) added to room state.
* Domain helpers: `createStack()`, `addCardToStack()`, `collapseStackIfNeeded()` enforcing: 2+ cards, one stack per card, bidirectional `stackId`/`cardIds` consistency, atomic mutation.
* No client-triggerable commands yet — covered by tests/fixtures only.
* Files: `server/src/rooms/state/RoomState.ts` (extend), `server/src/commands/stack/{create-stack,add-card-to-stack,collapse-stack-if-needed}.ts`.

**Depends on:** Unit 3.
**Done when:** unit/integration tests demonstrate invariants hold across create, add, and collapse-on-single-card-remaining.

---

### 14. Stack creation via drag (STACK_CARD)

* `STACK_CARD` command: card→card and card→existing-stack, validating same `face`, standalone status, and lock ownership per spec §29–31.
* Require the sender to own the source-card lock. The target must be unlocked or
  locked by the same sender; reject a target owned by another player. Revalidate
  all source and target state on the server immediately before one atomic mutation.
* Client: snap-target detection during drag (visual preview), sends `STACK_CARD` on drop; server is the source of truth on whether the stack succeeds.
* Visual stack offset rendering (`Stack.tsx`), so stack size is apparent.
* Files: `server/src/commands/stack/stack-card.ts`, `client/src/tabletop/Stack.tsx`, `client/src/tabletop/interactions/snap-detection.ts`.

**Depends on:** Units 8, 13.
**Done when:** dragging one standalone card onto another (same face) creates a visible, synchronized stack; mismatched-face drops are rejected.

---

### 15. Stack manipulation (move, draw, delete, top-card ops)

* `MOVE_STACK`: same claim/drag protocol as cards, applied to the whole stack.
* `DRAW_CARD`: removes top card to standalone at target coordinates; collapses stack to standalone if one card remains.
* `DELETE_STACK`: deletes the stack and all contained cards.
* Extend flip/tap/untap/delete so they operate on the top card of a stack only
  (reject if not exposed). Top-card deletion removes the card and atomically
  collapses the stack if only one card remains.
* Files: `server/src/commands/stack/{move-stack,draw-top-card,delete-stack}.ts`.

**Depends on:** Unit 14.
**Done when:** a 3+ card stack can be dragged as a unit, drawn from (down to collapse), and deleted outright; flip/tap on a stack only ever affects the top card.

---

## Phase 4 — Sessions & Multiplayer Polish

### 16. Room creation & join flow

* Lobby UI: create room (optional password) → room code/URL; join room by code + temporary display name.
* Server: room creation/join validation, password check, and canonical
  `hostPlayerId` assignment to the creator. Never synchronize the password or its
  hash.
* Files: `client/src/features/lobby/`, `server/src/http/routes.ts` (or Colyseus matchmaking filters), `server/src/rooms/TableRoom.ts` (`onAuth`/`onCreate` options).

**Depends on:** Unit 3.
**Done when:** a user can create a room, share the resulting URL, and a second user can join it with a display name (and password, if set).

---

### 17. Reconnection & disconnect cleanup

* Colyseus reconnection support plus a short-lived reconnect token: recover the
  same `PlayerId` and display name during a bounded grace period; do not use the
  display name as identity.
* Immediate lock release on disconnect (per data-models.md §51, the simpler option is explicitly endorsed — no grace-period lock retention).
* On grace-period expiry, remove the disconnected player and perform permanent
  leave/host-migration cleanup.
* Files: `server/src/rooms/TableRoom.ts` (`onLeave` consented/unconsented branches, `allowReconnection`).

**Depends on:** Units 7, 16.
**Done when:** closing and reopening a tab within the reconnection window resumes the same player identity; a hard disconnect releases that player's locks immediately for others.

---

### 18. Host/admin basics

* Keep room metadata `hostPlayerId` as the single source of truth. Clients derive
  whether a player is host by comparing IDs; do not maintain a second mutable
  `Player.isHost` flag.
* Automatically reassign `hostPlayerId` deterministically when the host disconnects
  permanently (after the reconnection grace period).
* No admin actions beyond identifying the host are required for MVP (kick/clear/reset are explicitly post-MVP per spec §20).
* Files: `server/src/rooms/TableRoom.ts`.

**Depends on:** Units 16, 17.
**Done when:** clients identify the room creator as host from synchronized
`hostPlayerId`, and that ID reassigns to another connected player if the original
host leaves permanently.

---

### 19. Deployment hardening pass

* Audit that every position-bearing command introduced in Units 6–15 already
  rejects NaN/Infinity structurally and unreasonable world coordinates at the
  domain boundary; add regression tests for any gaps.
* Basic rate limiting on command handling.
* Confirm `docker-compose.yml` + Dockerfiles still build/run against the now-implemented app (scaffold already verified against placeholders).
* Files: touches most `server/src/commands/*`.

**Depends on:** Units 6–15 (everything that accepts commands or coordinates).
**Done when:** malformed coordinate and command-flood tests are rejected without
crashing or corrupting the room; a fresh `docker compose up --build` serves a
fully playable table.

---

## Explicitly out of scope for this breakdown

Per spec §25/§26, these are post-MVP and are not further broken down here: cursor presence, temporary pen tool, text annotations, deck builder, deck randomization, hands, zones, dice, tokens, persistent saved rooms, accounts.

---

## Suggested build order

```text
1 → 2 → 4 → 5 ─┐
3 ──────────────┼→ 6 → 8 → 10
3 → 7 ──────────┘       └→ 14 → 15
5 → 11
6 → 9
6 → 12
3 → 13 ─────────────────→ 14
3 → 16 → 17 → 18
7 ─────────→ 17
8–15 → 19
```

Units 1–2 and 3 may proceed in parallel. Unit 7 may proceed after Unit 3 while
Units 4–6 are being built. The arrows above represent hard prerequisites; unit
numbers express grouping and review order, not an otherwise implicit dependency.
