# AGENTS.md

## Project

Lightweight, self-hosted multiplayer tabletop for remotely prototyping physical card games.

Think: simplified Solitaire/FreeCell + virtual tabletop + collaborative whiteboard.

The app does **not** implement game rules. It provides generic tabletop primitives:

* load cards from local JPG/JSON files,
* spawn cards,
* drag/move cards,
* flip cards,
* tap/untap cards,
* magnify cards,
* create/manipulate stacks,
* delete cards,
* synchronize shared state across users.

Primary priorities:

1. fast iteration,
2. simple self-hosting,
3. maintainable code,
4. easy extensibility,
5. minimal infrastructure.

---

## Stack

Frontend:

* React
* TypeScript
* Vite
* Konva / react-konva

Backend:

* Node.js
* TypeScript
* Colyseus

Validation:

* Zod

Deployment:

* Docker
* Docker Compose

Storage:

* filesystem-backed card catalog
* no database initially

Do not introduce hosted collaboration services.

---

## Architecture

```text
Browser
├─ React UI
│  ├─ lobby
│  ├─ card browser
│  ├─ menus
│  └─ overlays
│
└─ Konva tabletop
   ├─ cards
   ├─ stacks
   └─ interactions
        │
        │ HTTP + WebSocket
        ▼
Node / Colyseus server
├─ card catalog API
├─ card asset serving
└─ TableRoom
   ├─ players
   ├─ cards
   ├─ stacks
   ├─ locks
   └─ command handlers
        │
        ▼
cards/
├─ *.jpg
└─ *.json
```

Keep UI, rendering, networking, and domain logic separate.

---

## Multiplayer Model

The server is authoritative.

Clients send semantic commands such as:

```text
SPAWN_CARD
CLAIM_OBJECT
RELEASE_OBJECT
MOVE_CARD
MOVE_STACK
FLIP_CARD
TAP_CARD
UNTAP_CARD
STACK_CARD
DRAW_CARD
DELETE_CARD
DELETE_STACK
BRING_TO_FRONT
```

Do not synchronize raw UI events such as mouse-down or mouse-move semantics.

Flow:

```text
user input
→ client interprets action
→ command sent to server
→ server validates
→ server mutates canonical state
→ Colyseus synchronizes result
→ clients render
```

Do not use P2P or CRDT synchronization.

---

## State Categories

Always distinguish these:

### Server-authoritative room state

* card positions,
* card face,
* card orientation,
* stack membership,
* stack order,
* z-order.

### Shared ephemeral state

* object locks,
* cursors,
* temporary pen strokes,
* temporary presence.

### Local-only state

* menus,
* hover,
* magnified preview,
* viewport,
* zoom,
* local selections where appropriate.

Do not synchronize local UI state.

---

## Domain Model Rules

Card definitions and card instances are separate.

A `CardDefinition` is immutable catalog data.

A `CardInstance` is one physical copy on the table and references a definition ID.

Multiple instances may reference the same definition.

Stacks are explicit objects. Do not infer them solely from overlapping coordinates.

Stack ordering is:

```text
bottom → top
```

A stack exists only when it contains at least two cards.

If a stack falls to one card:

```text
destroy stack
→ remaining card becomes standalone
```

Keep multi-entity mutations atomic.

---

## Card Catalog

Cards are loaded from matching files:

```text
cards/
  fireball.jpg
  fireball.json
```

Minimum JSON:

```json
{
  "id": "spell-001",
  "type": "spell",
  "body": "Deal 3 damage."
}
```

The filename provides the initial display name.

The loader should:

* match files by stem,
* validate required fields,
* reject duplicate IDs,
* report missing pairs clearly,
* preserve additional metadata where practical.

Use Zod for file validation.

---

## Frontend Guidelines

Use React DOM for:

* menus,
* dialogs,
* lobby,
* card browser,
* settings,
* overlays.

Use Konva for:

* cards,
* stacks,
* tabletop selection,
* drag interactions,
* future annotations/presence.

Do not implement ordinary application UI inside the canvas unless needed.

Keep world/table coordinates separate from screen coordinates.

Server state should use world coordinates so future pan/zoom does not affect networking.

Prefer small functional React components and hooks.

Do not duplicate synchronized server state into unrelated React state.

Use ordinary React state first. Add Zustand only if local UI state becomes cumbersome.

Do not add Redux without a concrete need.

---

## Dragging

Dragging should feel immediate locally.

Recommended flow:

```text
drag start
→ claim object
→ move locally
→ send throttled MOVE_* updates
→ send final position
→ release object
```

Use roughly 20 Hz for movement updates initially.

Do not send one packet per pointer event.

Remote movement may be interpolated client-side.

Object locks must be temporary and released on:

* drag end,
* disconnect,
* timeout.

---

## Backend Guidelines

Keep `TableRoom` thin.

Message handlers should generally:

```text
validate payload
→ authorize
→ call domain operation
→ return/synchronize result
```

Put mutation logic in reusable domain functions such as:

```text
spawnCard()
moveCard()
createStack()
addCardToStack()
drawTopCard()
collapseStackIfNeeded()
deleteCard()
claimObject()
releaseObject()
```

Do not put all domain logic directly inside Colyseus callbacks.

---

## Validation

Use two validation layers.

### Structural validation

Zod handles:

* payload shape,
* required fields,
* finite numbers,
* valid enum/string forms.

### Domain validation

Server logic handles:

* entity existence,
* lock ownership,
* valid stack operation,
* top-card access,
* invariant preservation.

Do not confuse structural validation with domain validation.

---

## Rendering

Cards are rendered dynamically:

```text
┌───────────────┐
│      ART      │
├───────────────┤
│   BODY TEXT   │
└───────────────┘
```

Approximately half artwork, half text.

Text should shrink to a minimum font size, then clip overflow.

Magnification should normally use a separate preview rather than modifying canonical card size/state.

---

## Shared Code

Keep shared protocol definitions in a small shared module/package.

Typical contents:

```text
shared/
  commands.ts
  events.ts
  schemas.ts
  ids.ts
  protocol.ts
```

Share:

* command names,
* payload types,
* Zod schemas,
* protocol constants.

Do not place server implementation details there.

---

## Extensibility

Likely future features:

* constructed/randomized decks,
* shuffle,
* split/merge stacks,
* hands,
* zones,
* discard piles,
* tokens,
* counters,
* dice,
* cursors,
* temporary drawing,
* text labels,
* saved rooms.

Keep current boundaries clean enough to add these incrementally.

Do not prematurely introduce:

* ECS,
* plugin systems,
* scripting engines,
* generic rules engines,
* event sourcing,
* elaborate permissions.

Prefer concrete abstractions driven by current requirements.

---

## Avoid

Do not add without an explicit requirement:

* WebRTC/P2P,
* CRDT frameworks,
* hosted collaboration services,
* persistent accounts,
* OAuth,
* databases,
* Redux,
* physics engines,
* generalized rule engines,
* complex undo/redo history,
* production-scale infrastructure.

This is an internal prototyping tool.

Prefer boring, explicit, typed, testable code.

---

## Architectural Rule of Thumb

```text
Does it change what the shared tabletop IS?
→ server-authoritative state

Does it represent what another player is temporarily DOING?
→ ephemeral shared state/event

Does it only affect this client's UI/view?
→ local client state
```

When adding a feature, preserve this separation unless there is a strong reason not to.
