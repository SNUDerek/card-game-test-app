# Card Game Prototyping Table

## 1. Project Overview

Build a lightweight, browser-based multiplayer application for remotely prototyping physical card games.

The application should behave like a simplified combination of:

* Windows Solitaire / FreeCell
* a virtual tabletop
* a collaborative whiteboard

It is **not** a rules engine. The application should not know or enforce the rules of any particular card game.

Instead, it provides a shared digital tabletop where users can:

* load card definitions and artwork from local files,
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

     * decks,
     * randomized decks,
     * constructed deck lists,
     * hands,
     * discard piles,
     * zones,
     * counters,
     * dice,
     * tokens,
     * annotations,
     * temporary drawing tools,
     * text labels,
     * saved tables,
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

# 4. Card Content

## 4.1 Card Source Files

Cards should be loaded automatically from a configured directory.

Each card consists of two matching files:

```text
cards/
    fireball.jpg
    fireball.json

    goblin.png
    goblin.json

    healing_potion.jpg
    healing_potion.json
```

Card artwork may use either the `.jpg` or `.png` format. PNG transparency must be
preserved when loading and rendering artwork.

Artwork must be square, with both its width and height between 32 and 512 pixels,
inclusive. Images displayed at a size other than their source resolution must use
nearest-neighbor scaling (no smoothing) to preserve pixel-art edges.

Matching should be based on filename stem.

For example:

```text
fireball.jpg
fireball.json
```

represent one card definition.

The application should validate the card directory during startup.

Errors such as the following should be reported clearly:

* JSON without matching image,
* image without matching JSON,
* malformed JSON,
* missing required fields,
* fields with invalid types,
* unsupported image formats,
* non-square or out-of-range image dimensions,
* incompatible field structure.

All card JSON files should conform to the same schema.

Minimum required fields:

```json
{
  "id": "spell-fireball",
  "type": "spell",
  "body": "Deal 3 damage to one target."
}
```

The `id` field is an opaque string, not required to follow any particular format.
The application derives each card's display name from its filename stem and must
not require a `name` field in the JSON; if a JSON `name` (or any other field
beyond `id`, `type`, `body`) is present, it is preserved as additional metadata
rather than used as the display name.

Card definition IDs must be unique across the catalog. The loader rejects the
entire catalog with a clear aggregated error if any `id` is duplicated.
Filename-derived display names are not required to be unique.

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
* card `id`,
* card `type`.

Cards should be draggable from the browser onto the tabletop.

Dragging a card definition onto the table creates a new card instance.

Multiple instances of the same card definition must be allowed.

The browser should be designed so it can later support:

* search,
* filters,
* categories,
* deck lists,
* constructed decks,
* randomized decks,
* predefined card sets.

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
* tap/untap the top card.

Future stack operations may include:

* shuffle,
* reverse,
* draw N,
* split stack,
* merge stacks,
* move stack to a zone.

Stack semantics should therefore be explicit in the application model rather than inferred solely from coordinates.

Detailed state representation will be specified separately.

---

# 9. Multiplayer

## 9.1 Session Model

The application should support temporary multiplayer rooms.

Typical workflow:

```text
Create Room
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
https://cards.example.com/room/KM7X-PQ3D
```

The first version does not require permanent user accounts.

Users may simply enter a temporary display name when joining.

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

Detailed state and message definitions will be specified in a separate document.

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

Presence data is distinct from persistent tabletop state.

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
* not become part of persistent game state unless explicitly desired.

### Text Labels

Users may place simple temporary or persistent text labels on the tabletop.

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

Recommended high-level architecture:

```text
┌────────────────────────────────────────────┐
│                 Browser                    │
│                                            │
│  React UI                                  │
│  ├─ Lobby                                  │
│  ├─ Room UI                                │
│  ├─ Card Browser                           │
│  ├─ Menus                                  │
│  └─ Overlays                               │
│                                            │
│  Konva Table                               │
│  ├─ Cards                                  │
│  ├─ Stacks                                 │
│  ├─ Selection                              │
│  ├─ Cursor/presence overlays               │
│  └─ Future annotations                     │
│                                            │
└──────────────────┬─────────────────────────┘
                   │
                   │ HTTP + WebSocket
                   │
┌──────────────────▼─────────────────────────┐
│             Application Server             │
│                                            │
│  HTTP                                      │
│  ├─ Card catalog                           │
│  ├─ Card images                            │
│  └─ App configuration                      │
│                                            │
│  Colyseus                                  │
│  └─ TableRoom                              │
│      ├─ authoritative table state          │
│      ├─ connected players                  │
│      ├─ command handlers                   │
│      └─ object ownership                   │
│                                            │
└──────────────────┬─────────────────────────┘
                   │
                   │ filesystem
                   │
┌──────────────────▼─────────────────────────┐
│                  cards/                    │
│                                            │
│  *.jpg / *.png                             │
│  *.json                                    │
│                                            │
└────────────────────────────────────────────┘
```

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
      lobby/
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

Card definitions should be loaded separately from multiplayer table state.

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

Do not duplicate artwork, card text, or other immutable definition data into every multiplayer card instance unless necessary.

---

# 18. Local vs Shared State

The application should make a clear distinction between three categories of state.

## Shared Persistent Room State

Examples:

```text
cards on table
stack membership
stack ordering
card positions
card facing
card orientation
```

This state belongs to Colyseus and is authoritative on the server.

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

# 20. Session Security

Security requirements are deliberately modest because the application is intended as a private/internal testing tool.

Initial security should include:

* HTTPS in deployed environments,
* sufficiently random room IDs,
* no public room listing,
* optional room passwords,
* basic rate limiting,
* host/admin privileges.

Authentication accounts are not initially required.

A room may optionally distinguish between:

```text
room ID
join password
host/admin secret
```

Possession of the room URL should therefore not necessarily grant administrative control.

Admin functionality may later include:

* kick user,
* clear table,
* reset room,
* reload card catalog.

---

# 21. Persistence

Persistent multiplayer storage is not required for the MVP.

Initial behavior may simply be:

```text
room created
    ↓
users play
    ↓
last player leaves
    ↓
room eventually destroyed
```

The architecture should nevertheless allow future addition of saved rooms.

Potential future persistence mechanisms include:

```text
JSON snapshots
SQLite
PostgreSQL
```

Do not introduce a database until persistent room storage is actually required.

---

# 22. Deployment

The application should be easy to self-host.

Use Docker Compose.

A likely deployment structure:

```text
docker-compose.yml

client/
  Dockerfile

server/
  Dockerfile

cards/
  *.jpg / *.png
  *.json
```

Card content should ideally be bind-mounted read-only:

```yaml
volumes:
  - ./cards:/app/cards:ro
```

This allows card content to be edited independently of application images.

A reverse proxy may later be placed in front of the application to provide:

* HTTPS,
* hostname routing,
* WebSocket forwarding.

The application itself should not depend on a particular reverse proxy.

---

# 23. Development Priorities

Prefer simple, explicit implementations over generalized systems during the initial prototype.

Avoid adding infrastructure without a concrete current need.

Specifically, do not initially introduce:

* user account systems,
* OAuth,
* CRDT frameworks,
* WebRTC networking,
* peer-to-peer state synchronization,
* databases,
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
* rooms will never be persisted,
* all users have identical permissions.

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

# 25. MVP Scope

The first usable milestone should contain:

### Card Loading

* Scan configured cards directory.
* Match JPG or PNG artwork with JSON files.
* Validate card JSON.
* Create card catalog.
* Serve card images and metadata.

### Room Management

* Create room.
* Join room by code/URL.
* Enter temporary display name.
* Disconnect/reconnect.

### Card Browser

* Display all card definitions.
* Sort by:

  * name,
  * ID,
  * type.
* Drag/spawn card onto table.

### Tabletop

* Green tabletop.
* Render cards.
* Move cards.
* Flip cards.
* Tap/untap cards.
* Magnify cards.
* Delete cards.

### Stacks

* Snap compatible cards into stacks.
* Render visual stack offsets.
* Move complete stack.
* Remove/draw top card.
* Manipulate top card.

### Multiplayer

* Shared canonical table state.
* Real-time card movement.
* Temporary object ownership while dragging.
* Synchronize all tabletop operations.

The following are explicitly **post-MVP**:

```text
cursor presence
pen tool
text annotations
deck builder
deck randomization
hands
zones
dice
tokens
persistent saved rooms
accounts
```

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
    filesystem-based card catalog

Database:
    none initially
```

The defining architecture is:

```text
React UI
    +
Konva tabletop
    +
Colyseus authoritative multiplayer server
    +
filesystem card catalog
```

This should remain a relatively small application whose complexity grows primarily through additional tabletop operations rather than additional infrastructure.

---

# 27. Follow-Up Specification

A separate specification should define the multiplayer domain model and protocol in detail.

That document should cover:

```text
CardDefinition
CardInstance
Stack
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

The state model and event/message API will be designed separately before implementation of the multiplayer domain layer.
