# Persistent Workspace Review (Archived)

Review of the codebase after the phases in [persistent-workspace.md](persistent-workspace.md)
were merged (PRs #20–#23, up to `1c70925`). Covers feature coverage, test coverage,
outstanding issues, unclean code, and refactoring targets.

Status at review time: `npm run typecheck` is clean; `npm test` passes (server 209,
client 128). A stale local `node_modules` was missing `better-sqlite3` and `fflate`;
`npm install` fixed it.

This review is preserved as historical context. Its three-wave follow-up plan was
completed through PRs #24–#31 and the Wave 3 cleanup that archived this document.

---

## 1. Blocker: the table is broken end to end

- **Server:** every room is tied to one set ([index.ts](../server/src/index.ts)), and
  spawns are checked against that set's library cards
  ([TableRoom.ts](../server/src/rooms/TableRoom.ts), `onCreate`). Library card IDs are UUIDs.
- **Client:** [CardCatalogContext.tsx](../client/src/features/card-browser/CardCatalogContext.tsx)
  still fetches `/api/cards`, the old file catalog loaded from `cards/` at startup. Those
  IDs look like `spell-001`.
- **Effect:** any card spawned from the card browser is rejected as "Unknown card
  definition". Even if a library card reached the table, the client could not draw it,
  because it is not in the catalog the client loaded.

The README notes "The table does not read library sets yet", but the server side has
already switched over, so neither path works. This blocks everything else.

---

## 2. Plan coverage

| Area | Server | Client |
|---|---|---|
| §4.1 Accounts, `requireUser`, cookie `onAuth`, `TRUST_PROXY` | ✅ | ✅ login/register |
| §4.2 Set/card/image CRUD, cache, importer, image serving | ✅ | ❌ no sets UI, card editor, or image picker; `prepareCardImage()` unused |
| §4.2 `CATALOG_CHANGED` | ⚠️ sends `{setId, cardIds, userId}`, not the planned `editorName`, so "Alice edited Fireball" is not possible | ❌ not handled: no refetch, no notice |
| §4.2 Remove the old file catalog | ❌ still loaded at startup: `/api/cards`, `/cards` static route, `CARDS_DIR`, `cards/` bind mount | ❌ still used |
| §4.3 Fork | ✅ | ❌ |
| §4.4 Deck CRUD and generator routes | ✅ | ❌ no deck editor or generator dialog |
| §4.4 `SPAWN_DECK` | ⚠️ only the `entries` form; `{source: "deck", deckId}` missing | ⚠️ command exists, nothing in the UI calls it |
| §4.5 Room creation over HTTP only | ✅ | ✅ |
| §4.5 Room browser | ✅ `GET /api/rooms` | ❌ lobby only has Create and "Join by code" |
| §4.5 Room name/description edit (`UPDATE_ROOM_METADATA`) | ❌ | ❌ |
| §4.5 Idle timeout | ❌ `RoomIdleTimeout` never wired into `TableRoom`; no env var, warning event, or Keep open | ❌ |
| §4.5 End room | ✅ route and `endRoom()` | ❌ no button; `ROOM_ENDED` not handled, so users see "Disconnected from the tabletop server." |
| §4.5 Last-person leave warning, close/reload warning | — | ❌ |
| §4.6 Set ZIP export | ✅ | ❌ no button |
| §4.6 Board PNG | — | ✅, but file name and HUD use the room ID, not the room name |
| §4.7 Router and screens | — | ❌ no router; URL handled by hand in `session.ts` (`/room/:id`; plan says `/rooms/:id`) |
| §5.1 "In use by Room X" with End/Fork actions | ⚠️ 409 message lists bare room IDs | ❌ |
| §5.3 Unarchive | ⚠️ sets via `PATCH archived: false`; `restoreCard()` exists but no route exposes it | ❌ |

---

## 3. Correctness issues

1. **Gap during room creation.** [room-routes.ts](../server/src/http/room-routes.ts)
   checks the set, then awaits `gateway.create`. `onCreate` then awaits `setMetadata`
   before `usageRegistry.acquire`. An archive request in that window succeeds, and the
   room then runs on an archived set. §5.3 asks for no async gap here. Fix: acquire
   synchronously in the route (or first thing in `onCreate`) and re-check `archived` there.
2. **Cards and decks can be edited inside an archived set.** `createCard` checks for
   that; `updateCard`, `createDeck`, and `duplicateDeck` do not.
3. **Expired creation tokens are never cleaned up.** `RoomCreationRegistry.pending` only
   drops a token when it is used or revoked. Small leak, but nothing sweeps it.
4. **Room-list fields can be overwritten.** `GET /api/rooms` spreads `room.metadata` after
   `id` and `playerCount`, so a metadata key could replace them. Latent risk once metadata
   becomes editable.
5. **Username timing leak on login.** [auth/routes.ts](../server/src/auth/routes.ts) skips
   the scrypt work when the username does not exist, so response timing reveals which
   usernames exist. Low risk on a passcode-gated app.
6. **The client swallows errors.** The lobby's `/api/sets` fetch fails silently
   ([Lobby.tsx](../client/src/features/lobby/Lobby.tsx)), and a 401 from an expired
   session does not send the user back to the auth screen.
7. **Session sliding does not extend the browser cookie.**
   [sessions.ts](../server/src/auth/sessions.ts) extends `expires_at` in SQLite when a
   session is near expiry, but authenticated responses do not refresh the cookie's
   `Max-Age`. The browser therefore discards the cookie at its original 30-day deadline,
   even though the database session was extended.
8. **Set renames leave live room metadata stale.** `CardLibrary.updateSet()` emits a
   change, but `TableRoom` only relays it as `CATALOG_CHANGED`; it never updates the
   room's `setName` metadata. The room browser will continue showing the old name until
   the room ends.

---

## 4. Test coverage gaps

- **Stuck-lock test is missing.** §4.5 requires one: a room whose reserved seat is never
  used must be disposed and release its set usage lock.
- **No integration test ties `TableRoom` to `SetUsageRegistry` or `CardLibrary`.**
  Nothing checks that a room takes the usage lock on create and releases it on dispose,
  that it broadcasts `CATALOG_CHANGED`, or that spawns respect the set.
- `endRoom()` is only tested through a fake gateway. Nothing tests the real disconnect,
  the lock release, or that reconnection is skipped.
- [TableRoom.http-creation.test.ts](../server/src/rooms/TableRoom.http-creation.test.ts)
  authenticates with a fake display-name stub left over from the old join model.
- The auth route walk ([auth/routes.test.ts](../server/src/auth/routes.test.ts)) lists a
  few hard-coded paths. The plan asked it to walk every registered route.
- No client tests for `AuthContext`, `AuthScreen`, the create-room flow in
  `MultiplayerContext`, or `prepareCardImage` in a real browser (the existing test is
  jsdom only).
- There is no coverage command, generated coverage report, or enforced minimum. The raw
  test count is healthy, but it does not show which branches and integration paths remain
  unexercised.

---

## 5. Unclean code

- **Old path still in place:** `loadCardCatalog` at startup,
  [http/routes.ts](../server/src/http/routes.ts) and its tests,
  `CardDefinition`/`CardCatalogResponse` (still with the file-era `sourceName`), and the
  `cardDefinitionIds` option on `TableRoom`.
- **`TableRoomOptions` mixes test-only and real settings.**
  `authenticate(cookie, joinOptions)` takes `joinOptions` only for test stubs.
- **Dead check:** `describeConnectionError` still matches `/display name/`, though names
  now come from accounts.
- **Host concept remains** (`hostPlayerId`, `host.ts`, the "host" tag), while the plan
  says nobody owns a room. Harmless but contradicts the plan.
- **Duplicate definitions:**
  - `CardIdLookup` ([card-library.ts](../server/src/library/card-library.ts)) and
    `CardDefinitionLookup` ([spawn-card.ts](../server/src/commands/card/spawn-card.ts))
    are the same interface.
  - `IMAGES_DIR` is defined in env, but `index.ts` rebuilds it as `${DATA_DIR}/images`.
  - `GenerateDeckRequestSchema.params` repeats `DeckGenerationParamsSchema`.
  - `CreateRoomRequestSchema` uses a raw `max(100)` instead of a named constant.
- **Inconsistent route helpers:**
  - `asyncRoute` wraps one handler, but Express 5 already forwards thrown errors and
    rejected promises.
  - `room-routes.ts` casts with `as unknown as AuthenticatedRequest`; workspace routes
    have a `userId()` helper.
  - Room routes do their own `safeParse`; workspace routes have a `parse()` helper.
  - The `WorkspaceService` parameter is named `repository`.
  - `registerRoomRoutes(app, workspace, undefined, creationRegistry)` passes `undefined`
    positionally.
- **Two copies of the repositories.** `WorkspaceService` and `CardLibrary` each create
  their own `SetRepository` and `CardRepository`. Set archiving goes through
  `WorkspaceService.sets` and skips the library, so no change event fires.
- **Error codes collapse.** `stale_revision` and `conflict` both map to 409 with no
  distinguishing field, so the client cannot tell "reload" apart from "in use".
- **Duplicate barrel export:** [shared/src/index.ts](../shared/src/index.ts) exports
  `library.js` twice.

---

## 6. Refactoring targets

1. **Switch the client and table to the library model in one change** (fixes §1).
   `CardCatalogContext` loads `/api/sets/:setId/cards` for the room's set (from room
   metadata) and refetches on `CATALOG_CHANGED`. Then delete the file catalog,
   `/api/cards`, `/cards`, `CARDS_DIR`, and the bind mount, and retire
   `CardDefinitionSchema` or rebase it on `LibraryCard`.
2. **Slim down `TableRoom` (344 lines).** Move library binding (usage lock, change
   listener, set binding) into a small helper. The idle timeout and metadata editing also
   land here, so deal with this hotspot first.
3. **Merge the route helpers** (`parse`, `userId`, error mapping) into one `http/` module
   shared by room and workspace routes.
4. **Add a router (§4.7) before building the sets, cards, and decks screens.** `App.tsx`
   picks screens with a status check, which will not hold up at about seven screens.
5. **Add a small client API module:** a typed `fetch` wrapper that parses with Zod, sends
   401s to login, and maps 409s to a reload prompt. Every new screen needs it.
6. **Split the client bundle at route boundaries.** The current production build already
   reports an 842 kB minified entry chunk (about 257 kB gzip) and triggers Vite's 500 kB
   warning. Adding all planned editor screens to the same eager bundle will increase it
   further; the new router is a natural place for lazy-loaded screens.

---

## 7. Docs and config drift

- [docs/hosting.md](../docs/hosting.md) still says to leave `PUBLIC_SERVER_URL` empty;
  that variable was removed.
- `.env.example` lacks `ROOM_IDLE_TIMEOUT_MINUTES` (not wired anyway) and does not mention
  `DATA_DIR`. Its default ports (9000/9001) do not match the Compose fallbacks (8080/2567).
- `npm run user:create -w server` uses `tsx`, a dev dependency removed from the production
  image. The README's Docker example covers the importer but not `user:create`; the
  compiled `node server/dist/auth/create-user.js` should work but is undocumented.
- `npm install` changes `package-lock.json` (adds `hasInstallScript` for
  `better-sqlite3`). Worth committing.
- [README.md](../README.md) remains primarily a file-catalog guide and explicitly says
  the table does not use library sets. That statement accurately exposes today's blocker,
  but the rest of the document reads as if the legacy workflow were still the intended
  finished product.
- [persistent-workspace.md](persistent-workspace.md) still begins with “proposal” and
  “Nothing here is built yet”, and its parallel-work section describes old branch and
  wiring status. It should be archived or updated once the implementation is actually
  complete so it does not conflict with this review.

---

## 8. Suggested order

1. Catalog switch-over plus the missing room/library integration tests (§1, §6.1).
2. Set-binding race and the stuck-lock test (§3.1, §4).
3. Router and client API layer (§6.4, §6.5).
4. Editor screens (sets, cards, decks) and room UX (browser, End room, idle timeout,
   leave warning, metadata editing).
5. Cleanup and docs drift (§5, §7).

---

## 9. Parallel work plan

Tasks are grouped into waves. Tasks in the same wave can run in parallel on separate
branches. A later wave starts once the tasks it depends on are merged, not when the
whole earlier wave is done.

```text
Wave 1 (parallel)          Wave 2                              Wave 3
─────────────────          ──────                              ──────
A table on library ──────► E room lifecycle (server) ──┐
                                                       ├──► F2 room UX (live) ──┐
C client foundation ─────► F1 room UX (static) ────────┘                        ├──► I cleanup
                     └───► G sets & cards ──► H decks + dealing (also needs A, E7)
B server hardening         (no dependents; G/H benefit from its error codes)
D docs + test infra        (README rewrite merges after A)
```

### 9.1 Hotspot ownership

Most merge conflicts come from a few files. Within a wave, only the listed owner edits them.

| File(s) | Wave 1 owner | Wave 2 owner |
|---|---|---|
| `server/src/rooms/TableRoom.ts`, `index.ts` | A | E |
| `shared/src/cards.ts`, `shared/src/room.ts` | A | E |
| `shared/src/library.ts`, `shared/src/index.ts` | B | G (add only) |
| `server/src/http/*`, `server/src/library/*` | B | G/H (add only) |
| `client/src/App.tsx`, `main.tsx`, `multiplayer/session.ts` | C | F1 |
| `client/src/features/card-browser/CardCatalogContext.tsx` | A | H |
| `client/src/multiplayer/MultiplayerContext.tsx` | A (catalog binding only) | F1/F2 |
| `README.md`, `docs/`, `.env.example`, `docker-compose.yml` | D (except file-catalog removal, owned by A) | — |

### 9.2 Wave 1 (start now, all parallel)

**A. Table on the library model** (§1, §6.1). *Critical path.*
- Expose the room's `setId` to clients (room metadata or schema state).
- `CardCatalogContext` takes a `setId` and loads `/api/sets/:setId/cards`. Retire
  `CardDefinitionSchema`/`CardCatalogResponse` or rebase them on `LibraryCard`, with
  `imageUrl` as `/images/<id>`.
- `CATALOG_CHANGED` carries `editorName` (resolve the user's display name on the server).
  The client refetches and shows a short notice.
- Delete the file catalog: `loadCardCatalog` at startup, `/api/cards`, `/cards`,
  `CARDS_DIR`, the `cards/` bind mount, `http/routes.ts` and its tests. Keep
  `loadCardSources` for the importer.
- Remove the `cardDefinitionIds` option; tests use a stub `CardLibrary` or `:memory:` DB.
- Tests: an integration test where a room bound to a `:memory:` library takes the usage
  lock on create, releases it on dispose, rejects off-set spawns, and relays
  `CATALOG_CHANGED`.
- Also: merge `CardIdLookup` and `CardDefinitionLookup`.

**B. Server hardening** (§3.2, §3.3, §3.5, §3.7, §5, §6.3). No `TableRoom` changes.
- Refuse card update, deck create, and deck duplicate inside an archived set.
- Sweep expired creation tokens in `RoomCreationRegistry` on `issue()`.
- Dummy scrypt verify for unknown usernames on login.
- Refresh the session cookie's `Max-Age` when `SessionRepository.findUser` slides the
  session (return a "slid" flag; middleware re-sets the cookie).
- Add a distinguishing `code` field to error JSON (`stale_revision`, `conflict`,
  `in_use`) so the client can tell "reload" from "in use".
- Merge route helpers (`parse`, `userId`, error mapping) into one `http/` module; drop
  `asyncRoute`; options object for `registerRoomRoutes`.
- Add a card restore route (`POST /api/cards/:id/restore`, or `PATCH` with `archived`).
- One repository set shared by `WorkspaceService` and `CardLibrary`; route set archiving
  through the library so it emits a change.
- Small duplicates: `IMAGES_DIR`, `GenerateDeckRequestSchema` reusing
  `DeckGenerationParamsSchema`, room-name length constant, duplicate barrel export.
- Tests: route-walk test that enumerates registered routes (§4).

**C. Client foundation** (§3.6, §6.4, §6.5, §6.6).
- Add a router (`wouter` or `react-router`). Routes: login, lobby/room browser,
  `/rooms/:id`, `/sets`, `/sets/:id` (cards and decks tabs). Keep `/room/:id` as a redirect
  so existing links work.
- Replace manual `pushState` in `MultiplayerContext`/`session.ts` with router navigation.
- Typed API module: `fetch` wrapper with Zod parsing, 401 → logout/login screen, 409 →
  typed conflict error (use B's `code` field when it lands; fall back to status until then).
- Lazy-load route screens so the table and editors split the bundle.
- Lobby shows a visible error when sets fail to load.
- Placeholder screens for sets so G and H only fill them in.
- Tests: `AuthContext`, `AuthScreen`, the API wrapper, and routing.

**D. Docs, config, and test infrastructure** (§4, §7).
- Add `npm run coverage` (Vitest v8 provider) to both workspaces; report only, no
  threshold yet.
- Fix `docs/hosting.md` (`PUBLIC_SERVER_URL`), `.env.example` (ports, `DATA_DIR`), and
  document `node server/dist/auth/create-user.js` for Docker.
- Commit the `package-lock.json` `hasInstallScript` change.
- Update `persistent-workspace.md`: mark it implemented-in-part and point to this review,
  or move it to `planning/archive/`.
- Draft the README rewrite around the library workflow. Merge after A so it matches the
  removal of the file catalog.

### 9.3 Wave 2

**E. Room lifecycle on the server** (§3.1, §3.4, §3.8, §6.2, §4.5 of the plan). Needs A.
One owner, because every item touches `TableRoom`.
1. Extract library binding (usage lock, change listener, metadata) out of `TableRoom`.
2. Fix the creation race: acquire the usage lock synchronously before any `await`, and
   re-check that the set is not archived.
3. Update `setName` metadata when the bound set is renamed.
4. Build the room list explicitly instead of spreading metadata.
5. `UPDATE_ROOM_METADATA` command (name, description) with Zod schema.
6. Wire `RoomIdleTimeout`: `ROOM_IDLE_TIMEOUT_MINUTES` env, activity recording in the
   command wrapper, `ROOM_IDLE_WARNING`/`KEEP_OPEN` messages, expiry ends the room.
7. `SPAWN_DECK { source: "deck", deckId }`, checked against the room's set.
- Tests: stuck-lock (reserved seat never used), real `endRoom` (disconnect, lock
  released, no reconnection), idle expiry, metadata update, deck-source spawn.

**F1. Room UX, static parts.** Needs C. Uses existing server routes.
- Room browser in the lobby (`GET /api/rooms`), "New room" dialog with description.
- End room button (browser and HUD) with in-page confirmation.
- Handle `ROOM_ENDED`: show "Room ended by Alice" instead of a generic disconnect.
- Last-person leave dialog (Cancel / Download board image / Leave), and a best-effort
  `beforeunload` warning.
- Show the room name in the HUD; name board PNGs after the room.

**F2. Room UX, live parts.** Needs E and F1.
- Idle warning banner with Keep open and Download board image.
- Edit room name and description from the HUD.

**G. Sets and cards screens** (plan §4.2, §4.3, §4.6, §5.1). Needs C. Coordinate with A
on the card type that the renderer takes, since the live preview reuses it.
- Set list (counts, "forked from"), create, rename, archive/unarchive.
- Set page Cards tab: grid with search and type filter.
- `CardEditor`: image upload via `prepareCardImage`, existing-image picker, live Konva
  preview, 409 stale-edit handling that keeps the draft.
- Fork button with name prompt; Export button.
- "In use by Room X" notice with End room and Fork actions on archive 409s.
- Tests: editor form, stale-edit flow, in-use notice.

**H. Decks screens and dealing** (plan §4.4). Needs G's set page shell; the dealing part
needs A and E (item 7).
- Decks tab and `DeckEditor` (copy steppers, totals by type, 409 handling).
- `DeckGeneratorDialog` (size, max copies, type filter, seed, reroll; save or deal).
- In-room Decks panel in the card browser: Deal saved deck and Generate & deal, placed at
  the viewport centre, face-down and shuffled by default.

### 9.4 Wave 3

**I. Cleanup sweep.** After E and F2.
- Decide on the host concept: remove `hostPlayerId`, `host.ts`, and the HUD tag, or
  document why it stays.
- Remove leftovers: `describeConnectionError`'s display-name branch, the `joinOptions`
  argument on `authenticate`, the display-name stub in `TableRoom.http-creation.test.ts`.
- Re-run coverage, and set a modest threshold if the numbers support one.
- Final README and hosting pass; archive `persistent-workspace.md` and this review.

### 9.5 Suggested staffing

| Parallel tracks | Wave 1 | Wave 2 | Wave 3 |
|---|---|---|---|
| 2 people | A, then B / C, then D | E, then F2 / F1, then G, then H | I |
| 4 people | A / B / C / D | E, then F2 / F1 / G / H (deck editor first, dealing last) | I |
