# Card Game Prototyping Table

> Target specification for the shared-workspace iteration; these requirements are not all
> implemented yet. See [Persistent Workspace Plan](persistent-workspace.md) for delivery
> phases and [Data Models](data-models.md) for protocol details.

## 1. Project Overview

Build a lightweight, browser-based multiplayer application for remotely prototyping physical card games.

The application should behave like a simplified combination of:

* Windows Solitaire / FreeCell
* a virtual tabletop
* a collaborative whiteboard

It is **not** a rules engine. The application should not know or enforce the rules of any particular card game.

Instead, it provides a shared digital tabletop where users can:

* log in to a shared workspace,
* upload artwork and create, edit, fork, and export card sets,
* build or randomly generate decks from a set,
* place cards onto a shared play surface,
* freely move and manipulate cards,
* create and manipulate stacks,
* inspect cards,
* remove cards,
* and see other users interacting with the same table in real time.

The tool is intended primarily for a small group of known users doing internal game-design testing. Ease of development, ease of deployment, and ease of extending the tool are higher priorities than production-scale infrastructure or sophisticated security.

The application should be designed so that additional tabletop features can be added incrementally without requiring major architectural changes.

---

# 2. Primary Goals

The application should prioritize:

1. **Fast iteration**

   * New features should be easy to add.
   * Card content should be editable without modifying application code.

2. **Simple deployment**

   * The application should be deployable using Docker / Docker Compose.
   * Users should only need a web browser.

3. **Simple multiplayer**

   * Users should be able to create and join temporary shared sessions.
   * No external hosted collaboration service should be required.

4. **Ruleset independence**

   * The application should provide generic card and tabletop manipulation primitives.
   * Game-specific rules should remain external to the application.

5. **Extensibility**

   * The architecture should allow later addition of features such as:

     * hands,
     * discard piles,
     * zones,
     * counters,
     * dice,
     * tokens,
     * annotations,
     * temporary drawing tools,
     * text labels,
     * additional card metadata.

---

# 3. Core User Experience

## 3.1 Table

The primary screen is a large 2D tabletop.

The default visual style should resemble a simple card-table or Solitaire interface:

* dark green play surface,
* minimal visual clutter,
* cards displayed as flat 2D objects,
* simple menus and controls.

The table should support arbitrary card placement rather than fixed Solitaire-style slots.

Users should be able to freely drag cards around the available play area.

Pan/zoom support may be added if useful, but the initial implementation can assume a reasonably sized fixed tabletop.

---

# 4. Sets, Cards, and Decks

## 4.1 Shared Library

The remotely hosted workspace persists accounts and library data in SQLite, with image
files on disk. Every logged-in user can access and edit the same workspace; there is no
ownership or per-user access control.

- A **set** represents one version of a game and contains unique card definitions.
- A **card definition** belongs to exactly one set and has a name, type, body, image,
  optional metadata, and display order.
- A **deck** is a named template of `{cardId, copies}` entries from one set.
- A **card instance** is one physical copy on a temporary table. A dealt deck becomes
  instances and a stack, not a new kind of tabletop object.

The set editor offers card and deck tabs, image selection/upload, text editing, and a
card preview using the tabletop renderer. Images are immutable and deduplicated by hash.
Client cropping/resizing and server validation retain square PNG/JPEG artwork at 32–512
pixels. Preserve PNG transparency and nearest-neighbor rendering for pixel art.

## 4.2 Deck Building and Generation

Users can add cards and adjust copy counts in a deck editor, duplicate a saved deck, or
randomly generate entries using deck size, maximum copies per card, an optional type
filter, and a seed. Reject infeasible requests with a useful capacity explanation.
Generation previews can be edited, saved, or dealt directly without saving. Reproducibility
requires the same inputs, card ordering, and generation algorithm; saved entries preserve
an actual result. Type quotas and weights are deferred.

Deal creates all instances atomically and places them in one stack at the viewport center
in world coordinates. Shuffle and face-down default to on. A one-card deck creates a
standalone card. Validate set membership and the room card limit before any mutation.

## 4.3 Set-Wide Testing Lock and Forks

While any room uses a set, **the set and its cards cannot be archived**, because tables
reference those cards. Enforce this on the server and show which rooms are using the set,
with **End room** and **Fork this set** actions.

Everything else stays editable during a playtest. Users can create cards and edit card
text, type, and images, and those edits appear live on every table using the set, with a
short notice such as “Alice edited Fireball”. This lets typo and balance fixes land
without ending the room. To test a frozen version, fork the set and play the fork. Saved
decks are templates copied when dealt, so deck changes never affect a live table.

The lock begins at room creation and ends when the last room using the set is disposed:
last departure (after reconnection grace), idle timeout, or End room. Deleting tabletop
cards does not release it.

Forking deep-copies active cards and decks into a new independent set with new IDs and
remapped deck entries. Image files can be shared because they are immutable. The fork
starts unlocked and copies no rooms. This enables iteration during a playtest.

Outside testing, use revision checks to reject stale edits. Archive cards/sets instead
of hard-deleting them; a card still referenced by a saved deck cannot be archived until
removed from those decks. Archived sets cannot start rooms and can be unarchived.

## 4.4 Existing File Import

Keep matching JPG/PNG + JSON files as a CLI importer into a new set, not a boot-time
catalog. Validate matching stems, unique source IDs, required `id`, `type`, and `body`,
and image dimensions. Report malformed or missing pairs clearly. Derive initial display
names from filenames and preserve extra JSON metadata. Generate database UUIDs and store
the original JSON ID as `metadata.sourceId`.

## 4.5 Set Export

**Export set** downloads a ZIP containing versioned `set.json` and referenced images.
Include active cards, metadata, display order, and saved decks with copy counts and
consistent export IDs. Use relative image paths and include each image once. Export is
available during testing and excludes accounts, sessions, rooms, and archived content.

Start with this portable package. CSV, printable card sheets, and a reimport UI are
follow-ups; a set export is not a complete workspace backup.

---

# 5. Card Rendering

Cards should be dynamically rendered from their image and metadata rather than requiring complete pre-rendered card images.

Default card layout:

```text
┌─────────────────────┐
│                     │
│                     │
│        ART          │
│                     │
│                     │
├─────────────────────┤
│                     │
│      BODY TEXT      │
│                     │
│                     │
│                     │
└─────────────────────┘
```

Approximately:

* top 50%: artwork,
* bottom 50%: card text.

Artwork should be scaled appropriately within the available space.

Card body text should:

1. begin at a normal/default font size,
2. shrink until it fits,
3. stop shrinking at a configured minimum size,
4. clip remaining overflow if the content still does not fit.

Rendering should be deterministic and performed client-side based on the card definition.

---

# 6. Card Browser

A collapsible or pop-out card browser should provide access to available card definitions.

Users should be able to browse and spawn cards onto the table.

The initial browser should support sorting/filtering using:

* card `name`,
* card `type`,
* imported source ID (`metadata.sourceId`), when present.

Database card IDs are opaque UUIDs and are not shown or searched.

Cards should be draggable from the browser onto the tabletop.

Dragging a card definition onto the table creates a new card instance.

Multiple instances of the same card definition must be allowed.

The browser is scoped to the room's set and supports search and type filtering. A Decks
section offers saved decks to deal and a “Generate & deal” action. Library edits happen
in the set editor and obey the set-wide testing lock.

---

# 7. Card Manipulation

Cards placed on the table should support the following operations.

## 7.1 Move

Cards may be freely moved using click-and-drag.

Movement should feel immediate for the local player while also being synchronized to other connected users.

---

## 7.2 Flip

Cards can exist either:

* face-up,
* face-down.

Users must be able to toggle between these states easily.

A generic card-back appearance should be used for face-down cards unless configurable card backs are added later.

---

## 7.3 Tap / Untap

Cards can be:

* untapped: upright,
* tapped: rotated 90 degrees clockwise.

Users should be able to toggle tapped state easily.

For the initial implementation, arbitrary rotation is unnecessary.

---

## 7.4 Magnify

Users should be able to inspect a card at approximately 2–4× its tabletop size.

Magnification should preferably display a temporary preview rather than modifying the actual tabletop object's dimensions.

Potential interactions include:

* hover,
* right-click,
* keyboard modifier,
* double-click.

The exact UX can be refined during implementation.

---

## 7.5 Delete / Remove

Cards should be removable from the tabletop.

Possible interactions include:

* context-menu action,
* delete command,
* dragging into a visible trash target.

Removal deletes only the tabletop instance, not the underlying card definition.

---

# 8. Card Stacks

Cards with compatible facing should be able to snap together into stacks.

A stack represents an explicitly ordered collection of cards rather than merely several cards occupying similar coordinates.

Stacks should have a slight visual offset between contained cards so that stack size is visually apparent.

Example:

```text
┌─────────────┐
│             │
│    Card     │
│             │
└─────────────┘
  └─────────────┘
    └─────────────┘
```

A stack should behave as a tabletop object.

Users should be able to:

* drag the entire stack,
* inspect/manipulate the top card,
* draw/remove the top card,
* flip the top card,
* tap/untap the top card,
* shuffle the stack.

Future stack operations may include:

* reverse,
* draw N,
* split stack,
* merge stacks,
* move stack to a zone.

Stack semantics should therefore be explicit in the application model rather than inferred solely from coordinates.

Detailed state representation is defined in [data-models.md](data-models.md).

---

# 9. Multiplayer

## 9.1 Session Model

The application should support temporary multiplayer rooms.

Typical workflow:

```text
Log in → select a set → create room
    ↓
Receive room code / URL
    ↓
Share with other players
    ↓
Players join
    ↓
All users interact with the same tabletop
```

Example:

```text
https://cards.example.com/rooms/KM7X-PQ3D
```

Users log in with a persistent account; their display name comes from that account.
A live-room browser lists room name, set, and connected player count. Rooms have an
editable name and optional description, stored only in memory. Any member can edit them.
Each room uses one set. Users may join through the browser or a shared URL.

Rooms end when their last member leaves and any reconnect grace expires. A stale link
shows “This room has ended” instead of creating a replacement. Server restarts end all
rooms. In-app departure by the last connected participant warns that the table will be
lost and offers Cancel, Download board image, or Leave room. Browser-close warnings are
best-effort; they do not provide crash recovery. Count connections, including tabs.

So a forgotten open tab cannot keep a set locked, rooms also end after
`ROOM_IDLE_TIMEOUT_MINUTES` (default 120) without table changes, with a five-minute
in-room warning offering **Keep open** and **Download board image**. Any logged-in user
can **End room** from the room browser or the set editor's in-use notice, after
confirmation.

Rooms are created through an authenticated HTTP endpoint, never directly by a client
socket, so that no unauthenticated request can create a room or lock a set.

---

## 9.2 Server-Authoritative State

Multiplayer should use a server-authoritative architecture.

Clients send semantic commands to the server.

The server:

1. validates the command,
2. modifies canonical room state,
3. synchronizes the resulting state with connected clients.

Clients should not directly treat their local tabletop state as authoritative.

This is especially important for operations such as:

* card ownership during dragging,
* stacking,
* drawing,
* deleting,
* ordering cards within stacks.

The server should maintain simple state invariants even though the application does not implement game rules.

Examples:

* one card instance cannot belong to two stacks,
* each stack has one deterministic ordering,
* drawing removes exactly one top card,
* two users should not simultaneously control the same card.

Detailed state and message definitions are in [data-models.md](data-models.md).

---

# 10. Real-Time Interaction

## 10.1 Dragging

Dragging must feel responsive locally.

Do not require a network round-trip before updating the local drag position.

Suggested behavior:

```text
pointer down
    ↓
attempt to claim object

pointer move
    ↓
update local position immediately
    ↓
send throttled position updates to server

pointer up
    ↓
commit final position
    ↓
release object
```

Remote users should receive position updates frequently enough for movement to appear smooth.

Approximately 15–30 updates per second should be sufficient and should be configurable.

Interpolation may be used for remote movement if useful.

---

## 10.2 Temporary Object Ownership

While a user is actively dragging a card or stack, the object should be temporarily considered owned or held by that user.

This prevents multiple users from simultaneously manipulating the same object.

The lock should automatically disappear if:

* the drag ends,
* the user disconnects,
* the lock times out unexpectedly.

The implementation should remain lightweight rather than introducing a complicated distributed-locking system.

---

# 11. Presence

Users should eventually be able to see other connected users' cursors.

Presence data is distinct from canonical tabletop state; neither survives room disposal.

Examples of presence information:

```text
player ID
display name
cursor position
currently selected object
currently held card or stack
```

Presence should be treated as ephemeral.

It does not need to be persisted or restored after a room is restarted.

Cursor synchronization can be added after the core tabletop mechanics are functional.

---

# 12. Future Collaborative Tools

The architecture should permit later addition of lightweight collaboration tools.

Possible features:

### Temporary Pen

Users can draw temporary annotations over the table.

Strokes should:

* synchronize to connected users,
* fade automatically after a configurable duration,
* disappear without being saved to the workspace.

### Text Labels

Future text labels may remain for the lifetime of a room; they do not imply saved rooms.

These features are not required for the initial MVP but should not require architectural redesign.

---

# 13. Technology Stack

Use the following primary stack.

## Frontend

```text
React
TypeScript
Vite
react-konva / Konva
```

Responsibilities:

* application UI,
* card browser,
* room interface,
* menus,
* local UI state,
* tabletop rendering,
* pointer interactions,
* drag-and-drop,
* magnified card preview.

Konva should be used as the primary tabletop rendering/interactivity layer.

Standard React DOM components should be used for menus, dialogs, overlays, card browsers, and other conventional UI.

Avoid implementing application UI inside the canvas unless doing so provides a clear advantage.

---

## Multiplayer Server

```text
Node.js
TypeScript
Colyseus
```

Colyseus should provide:

* room lifecycle,
* WebSocket networking,
* authoritative room state,
* client synchronization,
* player connections,
* reconnection handling.

The multiplayer implementation should remain self-hosted.

Do not introduce hosted collaboration systems such as Liveblocks.

---

## Validation

Use:

```text
Zod
```

for runtime validation where appropriate.

This should include at minimum:

* card JSON definitions,
* configuration files,
* client command/message payloads.

Shared TypeScript types should be used wherever practical.

---

# 14. Application Architecture

```text
Browser
├─ React: login, live rooms, set/card/deck editors, export controls
└─ Konva: cards, stacks, interactions, board-image rendering
        │ HTTP + WebSocket (same origin)
Node / Colyseus server
├─ HTTP: auth, library CRUD, images, set export, live-room listing
├─ Library repositories/cache and in-memory set usage registry
└─ TableRoom: canonical table, players, drag locks, commands
        │
DATA_DIR/ (Docker volume)
├─ workspace.db (accounts, sessions, images metadata, sets, cards, decks)
└─ images/ (immutable artwork files)
```

Room state and set usage locks are in memory only. Keep UI, rendering, networking,
library persistence, and tabletop domain functions separate.

---

# 15. Client Architecture

Keep application concerns separated.

A possible project structure:

```text
client/
  src/
    app/
    components/
    features/
      card-browser/
      auth/
      rooms/
      sets/
      exports/
      tabletop/
      presence/

    tabletop/
      Card.tsx
      Stack.tsx
      Table.tsx
      interactions/
      rendering/

    multiplayer/
      client.ts
      commands.ts
      subscriptions.ts

    cards/
      CardDefinition.ts
      CardRenderer.tsx

    state/
      local-ui-state.ts

    shared/
```

This is illustrative rather than mandatory.

Important architectural principle:

> Network state, tabletop rendering, and general UI state should remain separate concerns.

For example:

```text
Colyseus state
    ↓
tabletop view model
    ↓
Konva rendering
```

rather than embedding networking logic directly throughout rendering components.

---

# 16. Server Architecture

A possible server structure:

```text
server/
  src/
    rooms/
      TableRoom.ts

    cards/
      load-card-catalog.ts
      card-schema.ts

    commands/
      card/
      stack/
      player/

    auth/
    db/
      migrations/
    library/
    config/
    http/
    shared/
```

Room command handlers should be separated from the room lifecycle where practical.

Avoid turning `TableRoom.ts` into one large class containing every operation.

For example:

```text
commands/
  move-card.ts
  flip-card.ts
  tap-card.ts
  create-stack.ts
  draw-card.ts
  delete-card.ts
```

or equivalent logical groupings.

This is important because the number of available tabletop operations is expected to grow.

---

# 17. Card Catalog Architecture

Card definitions are persisted in SQLite and cached separately from multiplayer table state.
Library writes update the cache and notify live rooms using that set, which re-render the
changed cards. Definitions in use cannot be archived.

Conceptually:

```text
CardCatalog
    ├─ CardDefinition A
    ├─ CardDefinition B
    └─ CardDefinition C
```

A card definition represents reusable source data.

A tabletop card represents an instance referencing that definition.

Conceptually:

```text
CardDefinition
    id = 1
    name = Fireball
    type = spell
    body = ...

          ↓

CardInstance #123
CardInstance #456
CardInstance #789
```

All three instances can reference the same definition.

Do not duplicate artwork, card text, or other definition data into every multiplayer card instance unless necessary.

---

# 18. Local vs Shared State

The application should distinguish durable workspace data from three categories of live state.
Accounts, sessions, sets, card definitions, and decks persist in SQLite; artwork persists on disk.

## Server-Authoritative Room State (In Memory)

Examples:

```text
cards on table
stack membership
stack ordering
card positions
card facing
card orientation
```

This state belongs to Colyseus and is authoritative on the server. It is discarded when
the room ends; there is no autosave, manual room save, or restore path.

---

## Shared Ephemeral Presence

Examples:

```text
remote cursor
currently selected object
currently held object
temporary pen stroke
```

This is synchronized but does not need long-term persistence.

---

## Local UI State

Examples:

```text
card browser open/closed
currently magnified card
menu selection
local viewport
zoom
hover state
```

This generally should not be synchronized.

Use ordinary React state initially.

Zustand may be introduced later if local UI state becomes sufficiently complex.

Do not use Redux unless a concrete need appears.

---

# 19. Networking Philosophy

Network messages should represent semantic tabletop operations rather than raw UI interactions.

Prefer messages conceptually like:

```text
SPAWN_CARD
MOVE_CARD
FLIP_CARD
TAP_CARD
UNTAP_CARD
STACK_CARD
DRAW_CARD
MOVE_STACK
DELETE_CARD
```

rather than:

```text
MOUSE_DOWN
MOUSE_MOVE
BUTTON_CLICK
```

The client determines what the user's interaction means.

The server applies the resulting tabletop operation.

Detailed message formats will be specified separately.

---

# 20. Accounts and Session Security

Use username/password accounts, per-user random password salts, scrypt hashing, and a
server-wide `AUTH_PEPPER` from the environment. Store only hashed session tokens and use
HttpOnly cookies, SameSite=Lax, and Secure on HTTPS. Signup requires `SIGNUP_PASSCODE`;
unset means registration is disabled. Provide an operator account-creation CLI.

Serve HTTP and WebSocket traffic through the same origin with HTTPS in deployment.
Only the static client bundle, login, passcode-gated registration, and the health check
are public. Every other API route, image serving, room listing, room creation, and room
joins require a session. Enforce this once at the router level and test it. Apply
basic login/signup and command rate limits. Account identity supplies the player name;
multiple tabs get separate player IDs. Remove room passwords and host-only access rules.

Every authenticated user shares the workspace. Do not add OAuth, ownership, or roles.

---

# 21. Persistence and Board Capture

Persist accounts, sessions, image metadata, sets, card definitions, and saved deck templates
in SQLite using `better-sqlite3`, numbered SQL migrations, foreign keys, and transactions.
Keep image files on disk. There is no rooms table and no persistent room state.

Rooms dispose after the last departure/reconnection grace, releasing set usage locks.
Locks are held in the single server process and disappear with rooms on restart.

**Download board image** saves a PNG locally. Capture the whole occupied board with
padding, independently of viewport pan/zoom, including background, artwork, card text,
orientation, facing, and visible stack arrangement. Face-down cards remain face-down.
Exclude menus, selection, hover, and cursors. Use a separate export render, wait for
artwork, report failures, and bound image dimensions. An empty table yields a blank board.
Name the file with room name and timestamp. This image cannot restore a playable table.

---

# 22. Deployment

Use Docker Compose with a single Node/Colyseus server process, a durable `DATA_DIR`
volume containing `workspace.db` and `images/`, and same-origin HTTP/WebSocket proxying.
Browsers reach the page, API, images, and room socket through one origin, so there is no
CORS configuration. `PUBLIC_SERVER_URL` is removed.

HTTPS is required before remote team use, since accounts send passwords. For a home
server, prefer a Cloudflare Tunnel pointing a hostname at the nginx client container. It
supplies HTTPS and WebSocket proxying with no router port forwarding. Caddy or another
reverse proxy is the alternative. Set `COOKIE_SECURE=true` and `TRUST_PROXY` so rate
limits see real client IPs (`CF-Connecting-IP` behind Cloudflare).

Document `DATA_DIR`, `AUTH_PEPPER`, `SIGNUP_PASSCODE`, `COOKIE_SECURE`, `TRUST_PROXY`,
`ROOM_IDLE_TIMEOUT_MINUTES`, and `PUBLIC_CLIENT_URL`. Keep the old
cards directory only as optional importer input. Back up SQLite with `VACUUM INTO` or
the backup API, plus image files; preserve the pepper separately. Include restore
instructions before the team relies on the deployment. Deploys/restarts end live rooms.

---

# 23. Development Priorities

Prefer simple, explicit implementations over generalized systems during the initial prototype.

Avoid adding infrastructure without a concrete current need.

Specifically, do not initially introduce:

* OAuth,
* CRDT frameworks,
* WebRTC networking,
* peer-to-peer state synchronization,
* Redux,
* physics engines,
* complex animation frameworks,
* plugin systems,
* game-rule scripting engines.

The application's design should make such features possible where relevant, but they should not be prerequisites for the first playable version.

---

# 24. Extensibility Requirements

Although the initial product is intentionally small, extensibility is an explicit design goal.

Code should avoid assuming:

* every tabletop object is a card,
* every card belongs directly to the table,
* every stack represents a deck,
* there is only one card type,
* card metadata will always contain only `id`, `type`, and `body`,
* the only card orientation is tapped/untapped,
* card definitions and physical deck stacks are the same entity.

Current rooms are intentionally temporary, and all authenticated users have equal access.
Do not introduce persistence or permissions abstractions for hypothetical future needs.

New tabletop object types should eventually be possible.

Examples:

```text
Card
Stack
Token
Counter
Die
TextLabel
Zone
Annotation
```

Do not prematurely implement a generic entity/component system, but keep domain boundaries clean enough that these can be introduced incrementally.

---

# 25. Shared Workspace Delivery Scope

Build on the existing tabletop MVP. The next delivery includes:

- Persistent accounts and authenticated shared workspace access.
- Database-backed sets/cards, image uploads and selection, card editor, and file import.
- Saved decks, copy-count editor, simple random generation, and atomic deck dealing.
- Independent set forks and server-enforced set-wide locks during testing.
- Temporary room creation/joining, live-room browser, editable descriptors, reconnection,
  and last-participant leave warning.
- Existing card movement, flipping, tapping, magnification, deletion, stacks, shuffle,
  and authoritative multiplayer with short-lived drag locks.
- Set ZIP export and board PNG download.
- Docker volume, TLS setup, backup/restore documentation.

Follow the phase order in [Persistent Workspace Plan](persistent-workspace.md): database,
accounts, sets/cards with usage locks, decks/forks, room UX/exports, deployment documentation.

Deferred: cursor presence, pen/text annotations, hands, zones, dice, tokens, generator
quotas/weights, CSV/printable sheets, and export reimport UI. Persistent rooms, ownership
permissions, and complex history are outside this delivery.

---

# 26. Primary Technology Decisions

Unless implementation constraints reveal a substantial problem, use:

```text
Frontend:
    React
    TypeScript
    Vite
    react-konva / Konva

Backend:
    Node.js
    TypeScript
    Colyseus

Validation:
    Zod

Deployment:
    Docker
    Docker Compose

Storage:
    filesystem-backed immutable images

Database:
    SQLite via better-sqlite3
```

The defining architecture is:

```text
React UI
    +
Konva tabletop
    +
Colyseus authoritative multiplayer server
    +
SQLite library + filesystem images + temporary in-memory rooms
```

This should remain a relatively small application whose complexity grows primarily through additional tabletop operations rather than additional infrastructure.

---

# 27. Follow-Up Specification

The [data-models.md](data-models.md) specification defines the domain model and multiplayer
protocol. The [workspace plan](persistent-workspace.md) supplies the schema sketch and
implementation phases. These documents describe the target, not implementation status.

That document covers:

```text
CardSet
CardDefinition
DeckDefinition
CardInstance
Stack
CurrentUser
Player
PlayerPresence
RoomState

object ownership / locks

stack invariants

spawn semantics
move semantics
flip semantics
tap semantics
stack semantics
draw semantics
delete semantics

client → server commands

server → client synchronized state

ephemeral messages

reconnection behavior

conflict handling
```

Do not finalize the detailed Colyseus schema or message API solely from this document.

Keep these documents aligned as the workspace changes are implemented.
