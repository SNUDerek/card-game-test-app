# Persistent Workspace Plan

Accounts, database-backed card **sets** and **decks**, temporary rooms, and exports.

“Persistent” refers to the workspace library and accounts, not tabletop sessions.

Status: **proposal**. Nothing here is built yet.

---

## 1. What changes, in one paragraph

Today the app is a throwaway local table. Cards come from `cards/` at boot, rooms exist
only in memory, and a player is just a display name. The requests turn it into a small,
long-lived **shared workspace** on a remote host. People log in with an account; signup
requires a passcode. Each version of the game is a separate **set** with its own cards. A
set can be forked to try a variant. Decks are built from a set, by hand or at random. Rooms
exist only while people are using them and are listed in a room browser. There is no ownership: every logged-in user
can see and edit every set, deck, and room. We only need authentication, not permissions.

The multiplayer core (the authoritative `TableRoom`, commands, locks, and stacks) stays as it
is. Most of the work is new code *around* it: a database, HTTP APIs, and new screens.

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Set** | One version of the game. It owns a collection of unique card definitions. Sets are isolated from each other because rules may differ substantially between them. |
| **Card** | A `CardDefinition`: name, type, body, and image. It belongs to exactly one set. |
| **Deck** | A named list of `{card, copies}` drawn from one set's cards. It is a template for spawning, not a physical object. |
| **Fork** | A deep copy of a set, including all its cards and decks, into a new independent set. |
| **Room** | A temporary, in-memory table. It is bound to one set. Its card instances are physical copies on the table. |
| **Card instance** | Unchanged from today: one physical copy on a table, referencing a card ID. |

```text
Set "Skirmish v2" ──forked from── Set "Skirmish v1"
 ├─ Cards   (unique definitions, owned by this set)
 ├─ Decks   (card + copies, cards from this set only)
 └─ Rooms   (tables that play this set)
```

---

## 3. Database choice

### Recommendation: SQLite (via `better-sqlite3`), images on disk

| Need | Why SQLite fits |
|---|---|
| Simple self-hosting | One file on a Docker volume. No extra container, no credentials, no network. |
| Small team, low write volume | Occasional card and deck edits from a small team. No tabletop writes. |
| Single server process | Colyseus already runs as one Node process, so one process owns the DB. |
| Relational data | Set → cards → deck entries. Foreign keys and transactions matter, especially for atomic set forking. |
| Flexible metadata | A JSON column preserves additional card `metadata`. |
| Backups | `VACUUM INTO 'backup.db'`, plus a copy of the image files. |

- **Driver:** `better-sqlite3`. Keep database operations short and synchronous; verify
  installation in the project's Docker build when adding the dependency.
- **Query layer:** plain SQL in small repository modules, with Zod at the boundary for JSON
  columns. No ORM; the schema is seven tables.
- **Migrations:** numbered `.sql` files in `server/src/db/migrations/`, applied at startup
  and tracked with `PRAGMA user_version`.
- **Pragmas:** `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- **Images:** keep them on disk in `DATA_DIR/images/`, not in the DB. Name each file by
  content hash (`<sha256>.png`). That gives dedup for free and lets the server send
  immutable cache headers. It also makes forking cheap: a forked card points at the same
  image row, so no files are copied.

```text
data/                  ← one Docker volume
  workspace.db
  images/
    3f9a…c1.png
```

### Rejected alternatives

- **Postgres:** a second container, credentials, and backups to manage, with no benefit at
  this scale. If the app ever needs several server processes, move to Postgres then. Plain
  SQL keeps that migration cheap.
- **JSON files on disk:** no transactions and no referential integrity, and concurrent
  writes are unsafe. Forking a set atomically would be painful.

### Schema sketch

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,           -- uuid
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,              -- scrypt output
  password_salt TEXT NOT NULL,              -- per-user random
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,             -- sha256 of the cookie value
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE images (
  id          TEXT PRIMARY KEY,             -- sha256 of bytes
  mime        TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  byte_size   INTEGER NOT NULL,
  uploaded_by TEXT REFERENCES users(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE card_sets (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  forked_from_set_id TEXT REFERENCES card_sets(id),  -- lineage, display only
  revision           INTEGER NOT NULL DEFAULT 1,
  archived_at        INTEGER,
  created_by         TEXT REFERENCES users(id),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE cards (                        -- CardDefinition
  id          TEXT PRIMARY KEY,
  set_id      TEXT NOT NULL REFERENCES card_sets(id),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  body        TEXT NOT NULL,
  image_id    TEXT NOT NULL REFERENCES images(id),
  metadata    TEXT,                          -- JSON
  position    INTEGER NOT NULL,              -- display order within the set
  revision    INTEGER NOT NULL DEFAULT 1,    -- optimistic concurrency
  archived_at INTEGER,                       -- soft delete
  created_by  TEXT REFERENCES users(id),
  updated_by  TEXT REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (id, set_id)                        -- target for the composite FK below
);

CREATE TABLE decks (
  id          TEXT PRIMARY KEY,
  set_id      TEXT NOT NULL REFERENCES card_sets(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  revision    INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT REFERENCES users(id),
  updated_by  TEXT REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (id, set_id)
);

CREATE TABLE deck_cards (
  deck_id  TEXT NOT NULL,
  set_id   TEXT NOT NULL,
  card_id  TEXT NOT NULL,
  copies   INTEGER NOT NULL CHECK (copies BETWEEN 1 AND 99),
  PRIMARY KEY (deck_id, card_id),
  -- Both FKs carry set_id, so the DB itself refuses a card from another set.
  FOREIGN KEY (deck_id, set_id) REFERENCES decks(id, set_id) ON DELETE CASCADE,
  FOREIGN KEY (card_id, set_id) REFERENCES cards(id, set_id)
);

```

Design notes:

- The composite foreign keys on `deck_cards` enforce "a deck only contains cards from its
  own set" at the database level, not just in application code.
- Rooms and library usage locks live in memory only. There is no room table, snapshot
  schema, autosave, manual room save, or restore path.

---

## 4. Components by feature

### 4.1 Accounts (username + password, passcode-gated signup)

**The "salt from env" detail.** A salt must be **random per user** and stored in the row.
If every user shared one salt, identical passwords would produce identical hashes, and one
precomputed table would crack them all. What the environment variable should hold is a
**pepper**: one server-wide secret mixed into every hash that never enters the DB. A leaked
database alone then cannot be brute-forced. So we use both:

```text
hash = scrypt(password + AUTH_PEPPER, per_user_salt)   // node:crypto, no dependency
```

Server:

- `server/src/auth/passwords.ts`: `hashPassword()` and `verifyPassword()` using
  `crypto.scrypt` and `timingSafeEqual`.
- `server/src/auth/sessions.ts`: create, look up, and revoke sessions. The token is 32 random
  bytes; only its SHA-256 is stored. Sessions expire after about 30 days and slide on use.
  Delete expired rows at startup and once a day (`DELETE FROM sessions WHERE expires_at < ?`).
- `server/src/auth/middleware.ts`: `requireUser` Express middleware reads the cookie and sets
  `req.user`.
- Routes: `POST /api/auth/register` (requires `signupCode`), `POST /api/auth/login`,
  `POST /api/auth/logout`, and `GET /api/auth/me`.
- **Signup gate:** `SIGNUP_PASSCODE` env var, compared with `timingSafeEqual`. If it is
  unset, registration is disabled entirely rather than open. An `npm run user:create` CLI
  covers bootstrapping and recovery.
- Login and signup rate limiting, per IP and per username, in memory like the existing
  `rate-limit.ts`. This also rate-limits guessing the passcode.
- Cookie: `HttpOnly`, `SameSite=Lax`, and `Secure` when served over HTTPS. `SameSite=Lax` plus
  JSON-only request bodies covers CSRF for this app.
- **Colyseus:** `TableRoom.onAuth` reads the same cookie from `context.headers` on the
  WebSocket upgrade. `JoinRoomOptions.displayName` goes away because the name comes from the
  account. Each player entry gains a `userId`. One user in two tabs still gets two player
  entries.
- **Remove room passwords:** delete `room-access.ts`, the `password` join option, and the
  lobby field.
- **Everything is behind login.** Only these are reachable without a session: the static
  client bundle (so the login page loads), `POST /api/auth/login`,
  `POST /api/auth/register` (which itself requires the passcode), and `GET /health`.
  Everything else rejects unauthenticated requests: every other `/api/*` route, `/images/*`,
  room creation, and room joins. Apply `requireUser` once as router-level middleware, not
  per route, so a new route can't be left unprotected by accident. Add one test that walks
  the registered routes and asserts each non-public one returns 401 without a cookie.
- Remove the current open `cors()` middleware. Everything is same-origin, so no
  cross-origin access is needed.
- Env vars: `AUTH_PEPPER` (required; the server refuses to start without it),
  `SIGNUP_PASSCODE`, `DATA_DIR`, `COOKIE_SECURE`, and `ROOM_IDLE_TIMEOUT_MINUTES`.

Shared: `shared/src/auth.ts` holds the login/register schemas and the `CurrentUser` type.

Client: `features/auth/` has the login and register screens (register includes a passcode
field) and an `AuthProvider` context (`useCurrentUser()`). The app shell shows the login
screen until `/api/auth/me` succeeds.

**Single origin is required; remove `PUBLIC_SERVER_URL`.** The browser loads the client
from nginx and reaches `/api`, `/images`, and the Colyseus socket through that same nginx,
so every request is same-origin and needs no CORS. Letting browsers reach the server at a
different origin would require credentialed CORS with an exact allowed origin, possibly
`SameSite=None` cookies (weaker CSRF protection), and CORS-enabled artwork loading so the
board PNG canvas isn't tainted. Nothing needs that: only one port has to be reachable, and
the Vite dev server already proxies the same paths. Remove `PUBLIC_SERVER_URL` from the
client runtime config, Compose file, and README. `PUBLIC_CLIENT_URL` stays; it only affects
copied room links.

**Client IPs behind a proxy.** Login/signup rate limiting is per IP. Behind nginx (and
a tunnel or CDN in deployment), every request would otherwise appear to come from the
proxy. Have nginx forward `X-Forwarded-For`, set Express `trust proxy` to the number of
proxy hops, and read `CF-Connecting-IP` first when deployed behind Cloudflare. Make this
configurable (`TRUST_PROXY`) rather than trusting forwarded headers unconditionally.

### 4.2 Sets, cards, and image upload

Server:

- `server/src/db/`: connection, migrations, and repository modules for `images`, `sets`,
  `cards`, and `decks`.
- `server/src/library/card-library.ts`: an **in-memory cache of card definitions with
  write-through to SQLite**. It is keyed by card ID and knows each card's set. Rooms check
  "does this card exist and belong to my set?" synchronously, the way they use the
  `cardDefinitionIds` set today. It emits a `changed(setId)` event on every write.
- Set CRUD: `GET /api/sets`, `POST /api/sets`, `PATCH /api/sets/:id` (name, description, and
  `revision`), and `DELETE /api/sets/:id` (archive).
- Card CRUD, scoped to a set: `GET /api/sets/:id/cards`, `POST /api/sets/:id/cards`,
  `PUT /api/cards/:id` (sends the `revision` it expects; 409 if stale), and
  `DELETE /api/cards/:id` (archive; see §5).
- Image upload: `POST /api/images` with a raw body (`express.raw({ type: 'image/*',
  limit: '2mb' })`, no multer). The server checks type and dimensions with `image-size`
  (already a dependency), hashes the bytes, writes the file, and inserts a row. Uploading the
  same image twice returns the existing ID. Images are never deleted, even when no card
  uses them anymore. At this scale the disk cost is negligible; add cleanup only if it
  becomes a problem.
- `GET /api/images` lists uploaded images for the editor's existing-image picker.
- `GET /images/:id` serves files from `DATA_DIR/images` with `Cache-Control: immutable`,
  behind `requireUser`.
- **File import:** reuse `loadCardCatalog()` as an importer
  (`npm run cards:import -- ./cards "Set name"`). It creates a new set from a folder. The
  JSON `id` is kept as `metadata.sourceId`, because DB card IDs are UUIDs so that forks can
  copy cards without ID collisions. The boot-time file catalog is removed.
- A live-update hook: when a set or its cards change, every live `TableRoom` bound to that
  set broadcasts `CATALOG_CHANGED { setId, changedCardIds, editorName }`. Clients refetch
  the set's cards, redraw affected instances, and show a short notice (“Alice edited
  Fireball”) so cards don't change silently mid-game. Rooms validate spawns against the
  shared cache, so a card created mid-playtest can be spawned immediately.

Shared: `CardSetSchema`. `CardDefinitionSchema` gains `setId`, `revision`, and `archived`, and
`imageUrl` becomes `/images/<id>`. Create/update payload schemas are added.

Client:

- **Crop and resize on the client before upload.** Draw to a square `<canvas>`, downscale to
  512 px or less, and export PNG or JPEG. This keeps the existing square, 32–512 px rule
  without adding `sharp` to the server.
- `features/sets/`: a set list (name, description, card and deck counts, and "forked from"),
  and a set page with a **Cards** tab and a **Decks** tab.
- `features/sets/cards/`: a card grid with search and a type filter, plus a `CardEditor`
  form (image picker/uploader, name, type, body, and a live preview that reuses the Konva
  card renderer so it matches the table exactly).
- The existing `CardCatalogContext` becomes "the cards of this room's set", fetched from the
  API and refetched on `CATALOG_CHANGED`.

### 4.3 Forking a set

- `POST /api/sets/:id/fork { name }` calls `forkSet()` in `server/src/library/fork-set.ts`.
  It runs **in one transaction**:
  1. Insert a new `card_sets` row with `forked_from_set_id` set.
  2. Copy every non-archived card with a new UUID, the same `image_id`, and the same
     content. Build an `oldCardId → newCardId` map.
  3. Copy every deck and its `deck_cards`, remapping card IDs through the map.
- Rooms are **not** copied. New variants start with fresh tables.
- After a fork the two sets are completely independent. Editing a card in one never
  touches the other. Forking an in-use set is allowed; the new copy starts unlocked.
- UI: a "Fork set" button on the set page, a name prompt, and then navigation to the new set.
  Lineage shows as "forked from Skirmish v1".

### 4.4 Decks: building, generating, and dealing

A deck belongs to one set and lists `{card, copies}` from that set.

**Deck CRUD (server):** `GET /api/sets/:id/decks`, `GET /api/decks/:id` (with entries),
`POST /api/sets/:id/decks`, `PUT /api/decks/:id` (name, description, and the full list of
`{cardId, copies}` entries, all replaced in one transaction and checked against
`revision`), `DELETE /api/decks/:id`, and `POST /api/decks/:id/duplicate`.

**Random deck generation:** `server/src/library/generate-deck.ts` is a pure function that
takes an injected RNG so it can be unit tested:

```ts
generateDeck(cards: CardDefinition[], params: DeckGenerationParams, rng): DeckEntry[]

DeckGenerationParams = {
  size: number;               // total cards in the deck
  maxCopies: number;          // cap per unique card
  includeTypes?: string[];    // optional filter; default = all types
  seed?: string;              // reproducible; generated and returned if omitted
}
```

- Validation (domain, not Zod): it is infeasible if `size > eligibleCards × maxCopies`, after applying the type filter. The server returns a clear message
  such as "Only 12 creature cards × 3 copies = 36 < 40 requested".
- Algorithm: pick uniformly among cards still under `maxCopies`. A seed is reproducible
  for the same inputs, stable card ordering, and algorithm; saved entries preserve the result.
  Exact type quotas and weights can be added later.
- `POST /api/sets/:id/decks/generate { params }` returns
  `{ entries, seed }` **without saving**. The client previews the result and then chooses to
  save it as a deck, tweak it in the editor, or deal it directly.

**Dealing onto the table (replaces click-drag-then-shuffle):**

- New table command `SPAWN_DECK`. The payload is a union:
  - `{ source: "deck", deckId, x, y, shuffle, face }`, or
  - `{ source: "entries", entries: {cardId, copies}[], x, y, shuffle, face }`, for
    generated decks that weren't saved.
- A new domain function, `spawnDeck()`, checks that every card belongs to the room's set,
  expands the entries into N instances, optionally shuffles them, and builds **one stack in a
  single atomic mutation**. It respects `MAX_CARDS_PER_ROOM`. A one-card deck produces a
  standalone card, following the existing stack invariant.

Client:

- `features/sets/decks/DeckEditor`: the set's cards on one side, and the deck on the other
  with +/− copy steppers and running totals (overall and by type). It has a "Generate…"
  button that opens the generator dialog and fills or replaces the deck. It saves or discards
  changes and shows a stale-edit message on a 409 response. Decks stay editable while
  their set is in use (§5.1).
- `DeckGeneratorDialog`: fields for size, max copies, and an optional type filter. It shows a
  preview of the result with counts by type, a "Reroll" button, and the seed. Actions:
  **Save as deck** and **Deal to table** (the latter only when opened from a room).
- In the room, the card browser's panel gains a **Decks** section: each saved deck has a
  "Deal" button, plus "Generate & deal…". Dealing places the stack at the center of the
  current viewport, converted to world coordinates. The face-down and shuffle options
  default to on.

### 4.5 Temporary rooms and the room browser

A room is **bound to one set** when created. Its card browser, deck list, and command
validation are scoped to that set. Accounts, sets, cards, images, and decks persist;
rooms and everything placed on the table do not.

- **Rooms are created only over authenticated HTTP.** `POST /api/rooms { setId, name,
  description? }` runs behind `requireUser`. It validates the set, calls the matchmaker's
  `createRoom`, and reserves the creator's seat. It returns the room ID and seat
  reservation, which the client consumes to connect. Clients cannot create `table` rooms
  directly over the socket. Why: Colyseus runs a room's `onCreate` *before* the joining
  client's `onAuth`, so socket-side creation would let an unauthenticated request create a
  room and take a set usage lock before being rejected.
- **Joining** stays a Colyseus join by room ID, with the session cookie checked in
  `onAuth`. A stale room link shows “This room has ended”; it never creates a replacement
  room automatically.
- **Room browser data comes from Colyseus room metadata.** On create, call
  `setMetadata({ name, description, setId, setName })`. Update it whenever
  `UPDATE_ROOM_METADATA` succeeds. `GET /api/rooms` reads rooms via `matchMaker.query({
  name: "table" })`, returning metadata and `clients` as the player count. Remove the
  current `setPrivate(true)` call so rooms appear in that query. Listing and joining are
  both behind login.
- Store the room name and optional description in memory. Any member can edit them via
  a validated room command. There is no room ownership or host-only editing policy.
- Keep existing disconnect/reconnection grace behavior. After the last member leaves
  intentionally, or the last reconnection reservation expires, dispose the room and
  release its library usage locks (§5). A server restart also ends all rooms.
- **Idle timeout.** A forgotten open tab must not hold a set lock indefinitely. A room
  with no table-mutating commands for `ROOM_IDLE_TIMEOUT_MINUTES` (default 120) ends
  automatically. Five minutes before, members see “This room will end due to inactivity”
  with a **Keep open** button (which counts as activity) and **Download board image**.
  Drag claims and hover don't count as activity; any real table change does.
- **Anyone can end a room.** The room browser and the set editor's “in use” notice both
  offer **End room** via `POST /api/rooms/:id/end`, with an in-page confirmation. It
  disconnects members with “Room ended by Alice” and disposes the room without a
  reconnection grace period. This fits equal workspace access and gives a
  way out when a lock is held by someone who has walked away.
- **Stuck-lock test.** A room created over HTTP whose reserved seat is never used must
  still be disposed, releasing its set usage lock. Colyseus should dispose rooms when a
  seat reservation expires with no clients; cover it with a test rather than assuming.
- The lobby gains a live-room list and a “New room” dialog (set, name, optional description).
  Shareable room URLs continue to work while the room exists.
- If the last connected participant uses **Leave room** or navigates away inside the app,
  show: “You are the last person here. Leaving will end this room and discard the table.”
  Offer **Cancel**, **Download board image**, and **Leave room**. Downloading does not
  automatically leave. Count connections, not accounts, so two tabs remain two participants.
- A browser close/reload warning is best-effort. The warning does not guarantee recovery
  after a crash, lost connection, simultaneous departures, or server restart. Reconnecting
  members retain the existing grace period before the room is actually disposed.

### 4.6 Set export and board images

**Set export: one portable format first.** Add **Export set** on the set page. Download a
ZIP containing `set.json` and the referenced image files. JSON alone would leave artwork
behind; packaging the files makes the export useful away from this server.

- `GET /api/sets/:id/export`, authenticated, exports the set name/description, all active
  card definitions (including metadata and display order), and its decks with copy counts.
- Include `formatVersion` and export IDs for card/deck references. Image references are
  relative archive paths, not authenticated server URLs. Include each image only once.
- Export is read-only and allowed while the set is in use. Read all set, card, deck, and
  image records in one synchronous `better-sqlite3` transaction so exported deck entries
  match the exported cards, then build the ZIP from that snapshot.
- Build the ZIP with `fflate` (small, no dependencies). Images are already compressed, so
  store them uncompressed in the archive and compress only `set.json`.
- The initial export is a portable data package, not a workspace backup. It excludes
  accounts, sessions, rooms, and archived content. Reimport UI is a later feature; the
  versioned manifest should make it possible without preserving database IDs.
- CSV and printable card sheets are optional follow-ups, not additional initial formats.
  A printable sheet would be the graphical export of the set; it is distinct from a board image.

**Download board image:** add a clearly labelled button to the room HUD and last-person
leave dialog. Download a PNG locally; this does not save or restore a playable room.

- Capture the whole occupied tabletop, fitted to card/stack bounds with modest padding,
  independent of the user's current pan and zoom. An empty table produces a blank board.
- Preserve visible artwork, text, facing, orientation, stacks, and tabletop background.
  Face-down cards stay face-down. Exclude menus, selection outlines, hover, and cursors.
- Reuse the existing card rendering in a separate export render so capturing the board
  does not move the user's viewport or change shared state. Wait for artwork to load and
  show a useful error if it fails. Bound output dimensions for very spread-out tables.
- Name the download after the room and timestamp. No server storage, screenshot history,
  or browser permission prompt is needed for the app's own rendered board.

### 4.7 Cross-cutting: app shell and routing

The app now has about seven screens: login, room browser, table, set list, set page with
its cards and decks tabs, card editor, and deck editor. Room links need to be shareable
(`/rooms/:id`). Adding a small router (`react-router`, or `wouter` if we want it minimal) is
justified here. Data fetching can stay as plain `fetch` in feature hooks. Only add TanStack
Query if cache invalidation becomes tedious.

Docker: mount a `data/` named volume on the server, drop the `cards/` bind mount (or keep it
only for the import script), and add `AUTH_PEPPER`, `SIGNUP_PASSCODE`, and the other vars to
`.env.example`.

**HTTPS is required once accounts exist**; otherwise passwords and session cookies cross
the internet in plain text. The recommended home-server setup is a **Cloudflare Tunnel**
(`cloudflared`):

- Add an ingress rule mapping a hostname (for example `cards.example.com`) to the nginx
  client container (`http://localhost:${CLIENT_PORT}`). Cloudflare provides the HTTPS
  certificate and proxies WebSockets, which Colyseus needs, with no extra configuration.
- No router port forwarding is needed for the app, and the home IP isn't exposed by its
  DNS record. Once the tunnel works, the existing forwarded port can be closed.
- Set `COOKIE_SECURE=true`, `TRUST_PROXY` for the tunnel hop plus nginx, and
  `PUBLIC_CLIENT_URL=https://cards.example.com`.
- Local development stays plain `http://localhost` with `COOKIE_SECURE=false`.

A plain DNS record pointing at a forwarded port works technically but has no HTTPS, and
Cloudflare's proxied (orange-cloud) mode only supports a fixed list of ports. Caddy or
another reverse proxy with its own certificate is the alternative if a tunnel isn't
available.

---

## 5. Library locks while rooms are using content

These are temporary **usage locks**, separate from the short-lived drag locks. They are
server-enforced rules shared by everyone, not user ownership or access permissions.

### 5.1 Block archiving while testing; edits appear live

**While any room uses a set, the set and its cards cannot be archived.** Archiving is the
only change that could break a live table, because instances reference card IDs. Acquire
the usage lock when a room is created, before cards are dealt. Release it when the last
room using that set is disposed: by the last member leaving (after any reconnection
grace), by the idle timeout, or by **End room** (§4.5). Deleting cards from the table does
not release the lock.

- Reject archiving the set, or any card in it, while locked. Return 409 with the room(s)
  using the set. The UI shows “In use by Room X” with **End room** and **Fork this set**.
- Several rooms may test the same set concurrently. No per-card usage tracking is needed.

**Everything else stays editable, and card edits propagate to live tables.** Creating
cards, editing a card's text, type, or image, and editing the set's name/description are
all allowed during a playtest. Instances store only a card ID and render from the library,
so an edit shows up on every table using that set through `CATALOG_CHANGED` (§4.2). This
lets a typo or balance fix land mid-playtest without ending the room. To test a frozen
version instead, fork the set and play the fork.

**Saved decks are not locked either.** A deck is a template copied when dealt, so no deck
change affects a live table. Deck entries can only reference non-archived cards, and
archiving is exactly what the lock blocks.

### 5.2 Actions available during testing

Everything except archiving: browsing, spawning, tabletop manipulation, card and set
edits, card creation, image upload and assignment, all deck operations, export, and fork.
A fork copies cards and decks into a new independent set that no room is using.

### 5.3 Implementation and deletion

- Keep a small in-process usage registry: set IDs → room IDs. No database lock rows,
  lock leases, manual unlocking, or distributed lock service.
- All library mutation endpoints check usage on the server. Check and mutate without an
  asynchronous gap; likewise validate the set and register room usage without an asynchronous gap.
- Clean up registrations on room disposal and failed room creation. Disconnect grace keeps
  usage locks until disposal. A process restart clears locks along with the temporary rooms.
- Outside an active set, card deletion archives the definition. Reject archiving a card
  still referenced by a saved deck and list those decks. Fork/export skip archived cards.
- Set archiving hides it from the set list and room creation. Allow unarchive through the
  set API. Hard purge is out of scope.

### 5.4 Concurrent library editing

Retain `revision` checks for editable set/card/deck rows. Two editors can still conflict
when no room is using the content. Reject stale saves with 409 and offer reload while
preserving the user's draft. A revision does not keep historical card versions.

---

## 6. Build order

Each phase ships working software and leaves `npm test` green.

| # | Phase | Why this position |
|---|---|---|
| 0 | **DB foundation**: `better-sqlite3`, `DATA_DIR`, migration runner, repository test harness (in-memory `:memory:` DB), Docker volume | Everything else stores data. Small and low risk. |
| 1 | **Accounts**: users, sessions, passcode-gated register, login UI, `requireUser`, cookie-authed `onAuth`, remove the display-name field and room passwords, remove `PUBLIC_SERVER_URL` (single origin, so session cookies reach `/api` and the socket) | Needed before anything is exposed on a public host, especially uploads. It supplies `created_by` for later tables. It also touches the most existing code (lobby and join flow), so doing it first avoids rework. |
| 2 | **Sets and cards**: CRUD, uploads/image picker, cache, file importer, editor UI, set-scoped temporary rooms and set usage locks | Stable library data and a usable editing workflow. |
| 3 | **Decks and dealing**: CRUD, editor, simple generator, `SPAWN_DECK`, set fork | Removes manual drag-and-shuffle; forks allow editing cards during playtests. |
| 4 | **Room UX and exports**: live-room browser (room metadata), name/description editing, idle timeout, End room, last-person warning, set ZIP export, board PNG download | Makes the hosted tool and its output accessible to colleagues. |
| 5 | **Deployment and documentation**: `TRUST_PROXY`, Cloudflare Tunnel/HTTPS guide, README rewrite, database + images backup and restore instructions | Complete before the team relies on the hosted workspace. No room persistence or purge tooling. |

Suggested PR cut points: phases 0 and 1 together, then one PR per phase. Phase 2 is the
largest and could split into server/API and editor UI. Phase 3 could split into
"deck CRUD + SPAWN_DECK" and "generator".

---

## 7. Decisions

### Settled

- Accounts, images, sets, cards, and decks persist in the shared workspace.
- Rooms are temporary and disappear after the last member leaves and any reconnection
  grace expires. There are no room saves, snapshots for restoration, or saved-room browser.
- Room passwords are removed; all workspace features require login. Signup remains gated
  by `SIGNUP_PASSCODE`; unset means signup is off.
- Cards belong to exactly one set. Decks are `{card, copies}` templates from that set.
- While any room uses a set, the set and its cards cannot be archived. Card creation and
  edits are allowed and propagate live to tables, with an on-table notice. Saved decks are
  unaffected. The lock ends when the last such room ends.
- Browsers reach everything through one origin (nginx). `PUBLIC_SERVER_URL` is removed.
  Deployment uses HTTPS, recommended via Cloudflare Tunnel.
- Rooms end automatically after `ROOM_IDLE_TIMEOUT_MINUTES` without table changes, and any
  logged-in user can end any room.
- Rooms are created only through authenticated HTTP. Everything except the login page,
  login/register, and health check requires a session.
- Forks copy cards and decks into an independent, unlocked set. They do not copy rooms.
- Set export initially packages JSON and images in ZIP. Board capture downloads PNG.

### Initial defaults and deferred options

- One set per room.
- Generator: size, maximum copies, optional type filter, and seed. Quotas and weights later.
- No import UI for exported sets yet; keep the manifest versioned for future import support.
- CSV and printable set sheets can follow if the portable package does not meet the team's
  sharing needs. Board PNG download is part of the initial scope.
- Per-set card-back images remain out of scope.

---

## 8. Parallel work plan

Phases 0 and 1 (DB foundation and accounts) are in progress. This section lists which
remaining work can proceed alongside them and which must wait.

### 8.1 Can start now (no DB or auth needed)

Pure functions, client-only code, or table-domain code. Build against today's code and
wire into the library later.

**Status: built** (branch `feature/persistent-workspace-parallel`). Still to wire in later
phases:

- `SPAWN_DECK` validates against `cardDefinitionIds` until the set-scoped cache exists, and
  has no UI yet.
- `generateDeck()` and `buildSetExportArchive()` have no routes yet.
- `prepareCardImage()` has no editor that calls it.
- `RoomIdleTimeout` is not yet hooked into `TableRoom` or env config.
- The board PNG button names files by room ID until rooms have names.
- `.env.example` is unchanged, to avoid conflicts with the auth branch.

| Work | Why it's independent | Main files touched |
|---|---|---|
| **Board PNG export** (§4.6) | Client-only: separate Konva render reusing `CardRenderer`, bounds fitting, HUD button. | `client/src/tabletop/`, `RoomHud.tsx` |
| **`generateDeck()` + tests** (§4.4) | Pure function with an injected RNG over `CardDefinition[]`. | new `server/src/library/generate-deck.ts` |
| **`spawnDeck()` domain function + `SPAWN_DECK` `entries` variant** | Table domain only. Validate against the existing `cardDefinitionIds` for now; switch to the set-scoped cache later. Skip the `deckId` source. | `server/src/commands/`, `shared/` schemas |
| **Client image crop/resize utility** | Pure canvas helper (square crop, ≤512 px, export). | new `client/src/features/sets/` util |
| **Set ZIP builder** | `fflate` plus manifest building from a plain snapshot object. Wire to a DB read later. | new `server/src/library/export-set.ts` |
| **Deployment docs** | Cloudflare Tunnel guide, backup/restore instructions, `.env.example` notes. | `README.md`, docs |
| **Idle-timeout logic** | Activity timer, warning event, and Keep-open as a small unit-tested module. | new room module (see `TableRoom` hotspot in §8.5) |

### 8.2 Can start once phase 0 lands (migration runner and test harness)

These run in parallel with auth, provided their migrations are ordered after `users`:

- Library migrations and repositories: `images`, `card_sets`, `cards`, `decks`, `deck_cards`.
- `forkSet()`: one transaction, testable against `:memory:`.
- Image store: hash, `image-size` check, write to `DATA_DIR/images`, insert row.
- `CardLibrary` cache with write-through and the `changed(setId)` emitter.
- Importer CLI (`loadCardCatalog()` → `cards:import`).
- Usage registry: plain in-memory `setId → roomIds` map with tests.

### 8.3 Must wait for auth

- Every new HTTP route (sets, cards, decks, images, rooms, export), because each sits behind
  `requireUser` and the 401 route-walk test.
- `POST /api/rooms` creating rooms over HTTP, which depends on `onAuth` and the join-flow
  rewrite.
- Room browser and End room.
- Router and app shell (§4.7). It is technically independent but rewrites `App.tsx` and the
  lobby, which auth is also rewriting. Do it right after auth, or fold the router into the
  auth PR.

### 8.4 Critical path after auth

```text
set-scoped rooms + usage registry
 ├─ CATALOG_CHANGED live updates
 ├─ archive 409s / "In use by" UI
 ├─ SPAWN_DECK { source: "deck" }
 └─ End room / idle timeout releasing locks
```

### 8.5 Merge-conflict hotspots

Coordinate on these or assign a single owner:

- **`TableRoom`:** auth (`onAuth`, password removal), room metadata, idle timeout, set
  binding, and `SPAWN_DECK` all touch it. Keep parallel work in separate modules with thin
  hooks into the room.
- **`shared/` card schemas:** `CardDefinitionSchema` gains `setId`, `revision`, and
  `archived`. Let the library track make that change once.
- **`App.tsx`, `Lobby.tsx`, `endpoint.ts`:** auth, the router, and the `PUBLIC_SERVER_URL`
  removal. Removing `PUBLIC_SERVER_URL` is required for same-origin cookies, so it is part
  of phase 1 (§6).
- **`docker-compose.yml` and `.env.example`:** data volume, new env vars, `TRUST_PROXY`.

### 8.6 Suggested tracks

1. **Track A (in progress):** DB and auth, then router and app shell.
2. **Track B (start now):** board PNG export, then the last-person leave dialog once
   routing exists.
3. **Track C (start now):** `generateDeck`, the `spawnDeck` `entries` variant, and the ZIP
   builder. After phase 0: library repos, fork, image store, and cache.
4. **Track D (after auth):** routes and editor UI on top of the Track C modules.
