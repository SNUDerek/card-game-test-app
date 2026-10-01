# Card Game Prototyping Table

# Data Model and Multiplayer API Specification

> Target specification for the shared-workspace iteration; new account/library features
> are planned, not necessarily implemented. See the archived [Persistent Workspace Plan](archive/persistent-workspace.md)
> for the SQL schema and delivery phases and [Project Specification](project-spec.md) for UX.

## 1. Purpose

This document defines the application's core domain model and multiplayer protocol.

It covers:

* card definitions,
* card instances,
* stacks,
* players,
* room state,
* presence,
* object ownership,
* client → server commands,
* server → client events,
* state invariants,
* conflict handling,
* reconnection behavior.

The application uses:

```text
React + TypeScript
Konva
Node.js + TypeScript
Colyseus
Zod
```

The server is authoritative for shared tabletop state.

The client may perform optimistic/local rendering where appropriate, especially during dragging, but clients must not directly determine canonical room state.

---

# 2. Design Principles

## 2.1 Separate Definitions from Instances

A card definition describes reusable card content:

```text
Fireball
Goblin
Healing Potion
```

A card instance represents one physical copy currently on the tabletop.

Multiple card instances may reference the same card definition.

---

## 2.2 Explicit Tabletop Objects

Do not infer logical relationships purely from coordinates.

In particular:

* a stack is an explicit object,
* stack membership is explicit,
* stack order is explicit,
* card ownership during manipulation is explicit.

---

## 2.3 Server-Authoritative State

Clients send commands such as:

```text
MOVE_CARD
FLIP_CARD
STACK_CARD
DRAW_CARD
```

The server validates the command and mutates canonical state.

Clients render the resulting state.

---

## 2.4 Keep Workspace Persistence and Live State Separate

Durable workspace data: accounts, sessions, sets, card definitions, saved decks, and image
metadata in SQLite; immutable artwork files on disk. Rooms are never persisted.

Within a live room, distinguish three categories:

### Canonical room state (in memory only)

Examples:

* card instances,
* stacks,
* card position,
* card facing,
* orientation.

### Ephemeral shared state

Examples:

* cursor position,
* active drag,
* temporary object locks,
* temporary annotations.

### Local-only state

Examples:

* open menus,
* magnified preview,
* local viewport.

Which card a player is hovering is shared presence (`Player.hoveredCardId`, set by
`SET_HOVER`) so others can see it. Hover *styling* and the magnified preview stay local.

---

# 3. Identifier Types

All IDs should be represented as opaque strings.

Recommended logical aliases:

```ts
type UserId = string;
type CardSetId = string;
type DeckId = string;
type ImageId = string;
type CardDefinitionId = string;
type CardInstanceId = string;
type StackId = string;
type PlayerId = string;
type RoomId = string;
```

Use generated IDs for runtime entities.

Recommended:

```text
UUID
ULID
NanoID
```

Any collision-resistant approach is acceptable.

Clients must not rely on ID format or parse semantic meaning from IDs.

---

# 4. Workspace Library Models

```ts
interface CardSet {
  id: CardSetId;
  name: string;
  description: string;
  forkedFromSetId: CardSetId | null;
  revision: number;
  archivedAt: number | null;
}

interface CardDefinition {
  id: CardDefinitionId;
  setId: CardSetId; // exactly one set; cannot move a definition between sets
  name: string;
  type: string;
  body: string;
  imageId: ImageId;
  imageUrl: string; // derived: /images/<id>
  metadata?: Record<string, unknown>;
  position: number;
  revision: number;
  archived: boolean;
}

interface ImageAsset {
  id: ImageId; // SHA-256 of immutable file bytes
  mime: string;
  width: number;
  height: number;
  byteSize: number;
}
```

These are API/domain projections; the SQL schema in the workspace plan also includes
creation/update timestamps and attribution. Attribution does not grant ownership.
Use generated UUIDs for set/card/deck IDs. Multiple definitions may reference one image.

Definitions are editable at any time, including while rooms use their set; edits
propagate to live tables. They cannot be archived while their set is in use, so every
instance's definition exists for the room's lifetime. Revision fields detect stale writes;
they do not retain historical versions. Forking copies active cards and decks with new
IDs and remapped entries, sharing immutable images. Rooms are not copied.

The file importer creates a new set from matching PNG/JPG + JSON pairs. Validate required
`id`, `type`, `body`, unique source IDs, pairs, and square 32–512 px images with Zod and
image validation. Derive initial names from stems, preserve extra metadata, and retain
source IDs as `metadata.sourceId`. Files are importer inputs, not the boot-time database.

---

# 5. Card Library and Set Usage Locks

SQLite is the source of truth, with a write-through in-memory library cache keyed by
card ID. Fetch room catalogs through `GET /api/sets/:id/cards`. Do not copy definitions
into each Colyseus room or each instance.

```ts
type CardCatalog = Map<CardDefinitionId, CardDefinition>;
type SetUsageRegistry = Map<CardSetId, Set<RoomId>>; // server-only, in memory
```

Register usage at room creation and remove it on disposal (including failed creation
cleanup). Multiple rooms may use a set. It unlocks only when the final room is disposed,
including reconnect grace. Restart discards both rooms and usage registrations.

While used, reject **archiving the set or any of its cards**. Return 409 with an in-use
reason and room IDs/names. Check usage and commit the archive without an asynchronous gap;
register a room's set usage without racing an archive.

All other writes remain allowed during use: set metadata edits, card creation and edits
(including image reassignment), and every deck operation. After a set or card write,
notify every live room bound to that set, which broadcasts `CATALOG_CHANGED` (§41).
Clients refetch the set's cards, redraw affected instances, and show who edited what.
Rooms validate spawns against the shared cache, so new cards are spawnable immediately.
Decks are templates copied at deal time and never affect a live table. No per-card usage
locks are needed. These locks are separate from temporary drag locks and grant no
privileges to particular users.

A set unlocks when its last room is disposed: last departure (after reconnect grace),
idle timeout, or an explicit End room (§58).

Unlocked library edits use expected `revision` checks and reject stale writes with 409.
Preserve the client draft and offer reload. Archive cards rather than hard-delete them;
reject archival while any saved deck references them. Archived sets cannot start rooms;
unarchiving is supported. Hard purge is out of scope.

---

# 6. Card Instance Model

A `CardInstance` represents one physical card currently present in a room.

Recommended model:

```ts
interface CardInstance {
  id: CardInstanceId;

  /**
   * Reference into the room set's catalog. The definition's content may be edited
   * (and re-rendered live), but it cannot be archived while the set is in use.
   */
  definitionId: CardDefinitionId;

  /**
   * Current face state.
   */
  face: CardFace;

  /**
   * Current orientation.
   */
  orientation: CardOrientation;

  /**
   * Table position if the card exists independently.
   *
   * If the card belongs to a stack, the stack position is authoritative.
   */
  x: number;
  y: number;

  /**
   * Stack membership.
   * Logically, null means the card is directly on the tabletop. The Colyseus
   * wire schema represents this state by omitting the optional stackId field,
   * so domain code must treat undefined as this logical null value.
   */
  stackId: StackId | null;

  /**
   * Used for independent tabletop cards.
   */
  zIndex: number;
}
```

Enums:

```ts
type CardFace =
  | "front"
  | "back";

type CardOrientation =
  | "upright"
  | "tapped";
```

Do not store rotation as an arbitrary floating-point value for the initial implementation.

Rendering can derive:

```text
upright → 0°
tapped  → 90°
```

This keeps state semantic rather than graphical.

---

# 7. Stack Model

Stacks are explicit first-class room objects.

Recommended model:

```ts
interface CardStack {
  id: StackId;

  x: number;
  y: number;

  /**
   * Ordered bottom → top.
   */
  cardIds: CardInstanceId[];

  /**
   * Table layering among other objects.
   */
  zIndex: number;
}
```

A stack must contain at least two cards.

A single-card stack should normally collapse back into an independent card.

This keeps the object model simple:

```text
1 card  → CardInstance
2+ cards → CardStack
```

---

# 8. Stack Ordering

The stack array is ordered:

```text
index 0
    ↓
bottom card

...

last index
    ↓
top card
```

Example:

```ts
cardIds: [
  "card-A",
  "card-B",
  "card-C"
]
```

means:

```text
top
card-C
card-B
card-A
bottom
```

All stack operations should follow this convention.

---

# 9. Card Position Inside a Stack

Individual cards within a stack do not independently control their table coordinates.

For rendering:

```text
stack position
+
visual offset based on stack index
```

Example:

```ts
renderX = stack.x + index * STACK_OFFSET_X;
renderY = stack.y + index * STACK_OFFSET_Y;
```

The precise offset is client rendering configuration, not canonical game state.

This avoids storing redundant coordinates.

---

# 10. Facing Compatibility for Stacking

Initial stacking rule:

Cards may automatically snap together only when they have the same `face` value.

Examples:

```text
front + front → allowed
back + back   → allowed

front + back  → no automatic snap
```

This is a tabletop interaction rule, not a game-specific ruleset.

This restriction may be relaxed later.

Orientation does not prevent stacking.

---

# 11. Account and Player Models

```ts
interface CurrentUser {
  id: UserId;
  username: string;
  displayName: string;
}

interface Player {
  id: PlayerId; // one connection, retained during reconnect grace
  userId: UserId;
  displayName: string; // supplied by authenticated account
  connected: boolean;
}
```

Accounts persist; players do not. Two tabs from one account have distinct PlayerIds.
Never synchronize password hashes, salts, session token hashes, or the environment pepper.
The server stores per-user random salts with scrypt password hashes; `AUTH_PEPPER` stays
in the environment. Session cookies carry random tokens whose hashes are stored in SQLite.
Signup is passcode-gated. All logged-in users share access; there is no ownership model.

---

# 12. Player Presence

Presence is ephemeral and should be kept separate from canonical room state where practical.

```ts
interface PlayerPresence {
  playerId: PlayerId;

  cursorX?: number;
  cursorY?: number;

  selectedObjectId?: string | null;

  heldObject?: HeldObject | null;
}
```

Example:

```ts
interface HeldObject {
  kind: "card" | "stack";
  id: string;
}
```

Presence should disappear when the user disconnects or times out.

---

# 13. Object Lock / Ownership Model

Cards and stacks may be temporarily locked while a player manipulates them.

Recommended logical structure:

```ts
interface ObjectLock {
  playerId: PlayerId;

  objectKind: "card" | "stack";

  objectId: string;

  /**
   * Server timestamp.
   */
  acquiredAt: number;

  /**
   * Server timestamp after which stale ownership may be removed.
   */
  expiresAt: number;
}
```

Locks are ephemeral.

Discard drag locks on release/disconnect/timeout. There are no room snapshots.

---

# 14. Lock Semantics

When dragging begins:

```text
client
  ↓
CLAIM_OBJECT
  ↓
server checks object
  ↓
lock granted or rejected
```

Only the lock owner may perform continuous movement operations on the object.

Lock release occurs when:

```text
drag ends
OR
player explicitly releases
OR
player disconnects
OR
lock times out
```

Locks must not remain indefinitely after abnormal client termination.

---

# 15. Room State

Recommended conceptual room state:

```ts
interface RoomState {
  setId: CardSetId;
  name: string;
  description: string;

  cards: Map<CardInstanceId, CardInstance>;

  stacks: Map<StackId, CardStack>;

  players: Map<PlayerId, Player>;

  /**
   * Optional if locks are represented through synchronized room state.
   */
  locks: Map<string, ObjectLock>;
}
```

In actual Colyseus implementation, use appropriate Colyseus schema collections rather than raw JavaScript `Map`.

The conceptual relationships remain the same.

---

# 16. Room Invariants

The server must maintain the following invariants.

## Card uniqueness

A `CardInstanceId` appears exactly once in the room.

---

## Definition validity

Every card instance references an active definition belonging to `room.setId`.
The set usage lock keeps those definitions valid throughout the room lifetime.

```text
card.definitionId ∈ CardCatalog
```

---

## Stack membership

A card belongs to:

```text
zero stacks
OR
exactly one stack
```

Never multiple stacks.

---

## Stack consistency

If:

```ts
card.stackId === stack.id
```

then:

```ts
stack.cardIds
```

must contain that card exactly once.

Conversely, every card listed in:

```ts
stack.cardIds
```

must point back to that stack.

---

## Stack size

Stacks contain at least two cards.

If removal leaves one card:

```text
destroy stack
convert remaining card to standalone
```

---

## Lock exclusivity

An object may have at most one active owner.

---

## Stack ordering

Each stack has one deterministic bottom→top ordering.

---

# 17. Z-Ordering

The tabletop needs deterministic layering.

Use integer `zIndex` values.

The application does not need perfect compact numbering.

Example:

```text
card-A   zIndex 12
stack-B  zIndex 18
card-C   zIndex 27
```

When an object is brought to front:

```text
new zIndex = current maximum + 1
```

The server may periodically normalize values if they become excessively large.

This need not be implemented initially.

---

# 18. Spawn Semantics

Spawning creates a new `CardInstance`.

Input:

```ts
interface SpawnCardCommand {
  definitionId: CardDefinitionId;
  x: number;
  y: number;
}
```

Server behavior:

```text
validate definition
↓
validate coordinates
↓
generate instance ID
↓
create upright, face-up standalone card
↓
assign top zIndex
↓
insert into room state
```

Default instance state:

```ts
{
  face: "front",
  orientation: "upright",
  stackId: null
}
```

---

# 19. Client → Server Command Envelope

All commands should follow a predictable conceptual format.

```ts
interface ClientCommand<TPayload> {
  type: string;
  requestId?: string;
  payload: TPayload;
}
```

Example:

```json
{
  "type": "FLIP_CARD",
  "requestId": "req-84912",
  "payload": {
    "cardId": "card-abc"
  }
}
```

`requestId` is recommended but not mandatory for every high-frequency command.

It is useful for:

* acknowledgements,
* correlating errors,
* debugging,
* avoiding duplicate handling where necessary.

---

# 20. Initial Command Set

The initial command set should include:

```text
SESSION
SET_HOVER

SPAWN_CARD
SPAWN_DECK
UPDATE_ROOM_METADATA
SHUFFLE_STACK

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

Optional convenience operations:

```text
TOGGLE_FLIP
TOGGLE_TAP
```

Using explicit operations is preferable if client behavior benefits from knowing intended state.

---

# 21. SPAWN_CARD

Payload:

```ts
interface SpawnCardPayload {
  definitionId: CardDefinitionId;
  x: number;
  y: number;
}
```

Validation:

* definition exists, is active, and belongs to the room's set,
* coordinates are finite numbers.

Result:

```text
new standalone face-up upright card
```

---

# 22. CLAIM_OBJECT

Payload:

```ts
interface ClaimObjectPayload {
  objectKind: "card" | "stack";
  objectId: string;
}
```

Server behavior:

```text
object exists?
↓
currently unlocked?
↓
grant ownership
```

If already locked by the requesting player, treat as idempotent success.

If locked by another player, reject.

---

# 23. RELEASE_OBJECT

Payload:

```ts
interface ReleaseObjectPayload {
  objectKind: "card" | "stack";
  objectId: string;
}
```

Only the current owner may release an active lock.

The server may also release locks automatically.

---

# 24. MOVE_CARD

Payload:

```ts
interface MoveCardPayload {
  cardId: CardInstanceId;
  x: number;
  y: number;
}
```

Valid only if:

* card exists,
* card is standalone,
* sender currently owns/holds the card.

If the card belongs to a stack, reject and require `MOVE_STACK`.

The server updates:

```text
x
y
```

Movement messages are expected to occur frequently.

Do not generate verbose acknowledgement events for every intermediate movement packet.

---

# 25. MOVE_STACK

Payload:

```ts
interface MoveStackPayload {
  stackId: StackId;
  x: number;
  y: number;
}
```

Valid only if:

* stack exists,
* sender owns the stack.

Updates stack coordinates.

---

# 26. FLIP_CARD

Payload:

```ts
interface FlipCardPayload {
  cardId: CardInstanceId;
}
```

Behavior:

```text
front → back
back  → front
```

If the card belongs to a stack:

```text
only allow operation if the card is the top card
```

This avoids manipulating inaccessible cards buried in a stack.

The command should fail if the card is not exposed.

---

# 27. TAP_CARD

Payload:

```ts
interface TapCardPayload {
  cardId: CardInstanceId;
}
```

Result:

```text
orientation = "tapped"
```

If already tapped, operation is idempotent.

For stacked cards, only the top card should initially be directly manipulable.

---

# 28. UNTAP_CARD

Payload:

```ts
interface UntapCardPayload {
  cardId: CardInstanceId;
}
```

Result:

```text
orientation = "upright"
```

---

# 29. STACK_CARD

This command places a standalone card onto either:

* another standalone card,
* an existing stack.

Recommended payload:

```ts
interface StackCardPayload {
  cardId: CardInstanceId;

  target:
    | {
        kind: "card";
        cardId: CardInstanceId;
      }
    | {
        kind: "stack";
        stackId: StackId;
      };
}
```

The moving card is placed on top.

---

# 30. STACK_CARD: Card → Card

Example:

```text
A dragged onto B
```

Before:

```text
A standalone
B standalone
```

After:

```text
new stack

bottom
B
A
top
```

Server:

```text
validate A != B
validate both standalone
validate matching face
create stack
remove standalone positioning relevance
set both stackId
```

Stack position should normally inherit from the target card.

---

# 31. STACK_CARD: Card → Existing Stack

Example:

```text
A dragged onto Stack S
```

Before:

```text
S = [B, C]
```

After:

```text
S = [B, C, A]
```

Validate:

* A is standalone,
* stack exists,
* A's face matches the current top card's face,
* caller owns A,
* stack is not currently controlled by another user.

The exact lock policy may be conservative initially.

Reject ambiguous concurrent operations rather than attempting automatic merges.

---

# 32. Stack → Stack

Do not require stack-to-stack merging for the first MVP unless convenient.

Reserve a future command:

```text
MERGE_STACKS
```

Potential semantics:

```text
source stack appended to target stack
```

This should be added explicitly rather than overloading `STACK_CARD`.

---

# 33. DRAW_CARD

Removes the top card from a stack and places it independently.

Payload:

```ts
interface DrawCardPayload {
  stackId: StackId;

  /**
   * Destination table coordinates.
   */
  x: number;
  y: number;
}
```

Server:

```text
validate stack
↓
remove last cardId
↓
set card.stackId = null
↓
set card.x/y
↓
assign new top zIndex
```

If two cards existed before draw:

```text
stack [A, B]
```

drawing B leaves only A.

Therefore:

```text
delete stack
↓
A becomes standalone
↓
A inherits stack x/y/zIndex
```

This stack-collapse behavior should be handled atomically.

---

# 34. DELETE_CARD

Payload:

```ts
interface DeleteCardPayload {
  cardId: CardInstanceId;
}
```

If standalone:

```text
delete card
```

If top card of stack:

```text
remove it
↓
delete card
↓
collapse stack if necessary
```

Attempting to directly delete a buried card should initially be rejected.

This keeps interaction semantics predictable.

A future administrative command may permit arbitrary removal.

---

# 35. DELETE_STACK

Payload:

```ts
interface DeleteStackPayload {
  stackId: StackId;
}
```

Initial semantic recommendation:

```text
delete stack and all contained card instances
```

This should be clearly distinct from:

```text
UNSTACK
```

or:

```text
SPLIT_STACK
```

which may be added later.

---

# 36. BRING_TO_FRONT

Payload:

```ts
interface BringToFrontPayload {
  objectKind: "card" | "stack";
  objectId: string;
}
```

Server assigns:

```text
zIndex = maxZIndex + 1
```

Dragging an object may implicitly bring it to front.

If so, explicit client use of this command may rarely be required.

---

# 37. Future Stack Commands

Reserve conceptual space for:

```text
REVERSE_STACK
SPLIT_STACK
MERGE_STACKS
DRAW_MULTIPLE
MOVE_CARD_TO_STACK_INDEX
```

These should remain separate semantic commands.

Do not expose low-level commands such as:

```text
SET_STACK_ARRAY
```

to clients.

---

# 38. Command Validation

Every incoming client command must be validated on the server.

Validation has two levels.

## Payload validation

Use Zod.

Example:

```ts
const MoveCardSchema = z.object({
  cardId: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
});
```

## Domain validation

Examples:

```text
does card exist?
is card standalone?
does player own it?
is target stack valid?
do card faces match?
is card topmost?
```

Zod handles structure.

Domain code handles game-table invariants.

Do not combine these concerns unnecessarily.

---

# 39. Command Result Model

Low-frequency commands should optionally produce explicit success/error responses.

Conceptually:

```ts
interface CommandSuccess {
  requestId: string;
  ok: true;
}
```

```ts
interface CommandError {
  requestId?: string;

  ok: false;

  code: ErrorCode;

  message?: string;
}
```

Potential error codes:

```ts
type ErrorCode =
  | "INVALID_PAYLOAD"
  | "NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "OBJECT_LOCKED"
  | "INVALID_STATE"
  | "INVALID_STACK_OPERATION"
  | "CARD_NOT_EXPOSED"
  | "DEFINITION_NOT_FOUND";
```

Do not rely on human-readable strings for program logic.

---

# 40. Server → Client State Synchronization

Canonical room entities should primarily synchronize through Colyseus room state.

That includes:

```text
cards
stacks
players
```

Clients should subscribe to state changes and update their local view model.

Do not manually broadcast complete room snapshots after every command.

---

# 41. Server → Client Ephemeral Events

Some information is better represented as events than canonical room state.

Examples:

```text
COMMAND_ERROR
LOCK_REJECTED
CATALOG_CHANGED { setId, changedCardIds, editorName }
ROOM_IDLE_WARNING { endsAt }
TOAST / informational message
temporary pen stroke
temporary ping
```

Conceptually:

```ts
interface ServerEvent<TPayload> {
  type: string;
  payload: TPayload;
}
```

---

# 42. Cursor Updates

Future cursor support should use lightweight ephemeral messages.

Client payload:

```ts
interface CursorUpdatePayload {
  x: number;
  y: number;
}
```

These should be throttled.

Recommended range:

```text
10–30 messages/sec maximum
```

The server may broadcast cursor updates as ephemeral presence events.

---

# 43. Coordinate System

All canonical tabletop coordinates should use one shared world coordinate system.

Do not transmit browser pixel coordinates.

For example:

```text
table coordinates:
x = 1620
y = 840
```

The client converts between:

```text
screen coordinates
↕
camera / zoom transform
↕
table/world coordinates
```

This allows future pan/zoom support without changing network state.

---

# 44. Dragging Protocol

Recommended drag lifecycle:

```text
pointer down
↓
CLAIM_OBJECT
↓
lock granted
↓
local drag begins
↓
MOVE_* messages sent at throttled interval
↓
pointer up
↓
final MOVE_*
↓
RELEASE_OBJECT
```

The client may visually begin dragging immediately while waiting for lock confirmation, but must revert if the server rejects ownership.

Alternatively, for simpler initial behavior, the client may wait briefly for lock acknowledgement before allowing movement.

Either approach is acceptable.

---

# 45. Drag Throttling

Do not send one network message for every browser pointer event.

Throttle move messages.

Recommended initial target:

```text
20 Hz
```

approximately:

```text
one update every 50 ms
```

Final pointer-up position should always be sent immediately regardless of throttle timer.

---

# 46. Remote Drag Rendering

Remote clients should not need perfect high-frequency synchronization.

Recommended rendering:

```text
received network position
↓
interpolate from previous visual position
↓
smoothly approach latest authoritative position
```

This is a client-only rendering concern.

Canonical coordinates remain whatever the server last accepted.

---

# 47. Snap Detection

Recommended responsibility split:

### Client

Detect likely visual snap targets during drag.

Example:

```text
card overlaps card sufficiently
OR
card center is within snap radius
```

Display optional snap preview.

### Server

Determine whether the requested stacking operation is valid.

The client sends:

```text
STACK_CARD
```

after the drop.

The server must not trust the client's conclusion that stacking is valid.

---

# 48. Atomic Operations

Logical operations affecting multiple entities must execute atomically within the room handler.

Examples:

```text
card + card → stack

draw top card

delete top card causing stack collapse

future stack merge
```

Clients must never observe partially-mutated logical state such as:

```text
card.stackId points to stack
but stack.cardIds doesn't contain card
```

Domain helper functions should maintain invariants in one operation.

---

# 49. Recommended Domain Helpers

Server logic should expose reusable functions roughly equivalent to:

```ts
spawnCard(...)
spawnDeck(...)
moveCard(...)
moveStack(...)

flipCard(...)
tapCard(...)
untapCard(...)

createStack(...)
addCardToStack(...)
drawTopCard(...)
collapseStackIfNeeded(...)

deleteCard(...)
deleteStack(...)

claimObject(...)
releaseObject(...)
releaseAllPlayerLocks(...)
```

Room message handlers should primarily:

```text
validate payload
↓
authorize caller
↓
invoke domain operation
↓
return result
```

Avoid embedding all mutation logic directly inside Colyseus message callbacks.

---

# 50. Connection Lifecycle

When a client joins:

```text
validate room access
↓
assign / restore PlayerId
↓
create Player if required
↓
send current synchronized room state
↓
client renders table
```

When client leaves unexpectedly:

```text
mark/disconnect player
↓
release their object locks
↓
remove ephemeral presence
```

---

# 51. Reconnection

Temporary network interruptions should not immediately destroy player identity.

Use Colyseus reconnection support.

A reconnecting user should recover:

```text
same player identity where possible
same display name
same room
```

Object locks from the disconnected connection should not remain indefinitely.

Recommended behavior:

```text
disconnect
↓
short reconnection grace period
↓
lock remains temporarily OR is released immediately
```

For this application, **immediate lock release is acceptable and simpler**.

The room's card/table state remains unaffected.

---

# 52. Player Identity

Persistent UserId identifies the authenticated account. Server-generated PlayerId identifies
one room connection; a short-lived reconnect token retains that player during grace.
Do not use a display name as identity. Multiple connections may share UserId/displayName.
Validate authentication for room access; join payloads do not supply account identity.

---

# 53. Equal Workspace Access

There are no room passwords, owners, or host-only editing privileges. Any authenticated
user can create/join rooms and edit unlocked library content; any room member can change
room descriptors. Existing host bookkeeping must not authorize workspace operations and
can be removed as the account flow replaces the old lobby.

---

# 54. Room Metadata

```ts
interface TableRoomMetadata {
  roomId: RoomId;
  setId: CardSetId;
  name: string;
  description: string;
  createdAt: number;
}

interface UpdateRoomMetadataPayload {
  name: string;
  description: string;
}
```

`UPDATE_ROOM_METADATA` validates the fields and updates synced state and the Colyseus room
metadata (`setMetadata({ name, description, setId, setName })`), which is what the live-room
listing reads. Rooms are not private; the listing uses `matchMaker.query`. The set
binding cannot change. Metadata lives only in memory; no database room ID,
room row, autosave, or `SAVE_ROOM` command exists.

---

# 55. Coordinate Validation

Coordinates received from clients should be finite numbers.

Avoid unnecessarily restricting movement to the visible viewport.

The tabletop may later become effectively unbounded.

Recommended:

```text
reject:
NaN
Infinity
-Infinity
extremely unreasonable values
```

Use a generous sanity bound if desired.

Example:

```text
-1,000,000 ≤ x/y ≤ 1,000,000
```

---

# 56. Workspace HTTP API

Unauthenticated access is limited to the static client bundle, `POST /api/auth/login`,
`POST /api/auth/register` (passcode-gated), and `GET /health`. Every other HTTP route,
`/images/*`, room creation, and room joins require a valid session cookie. Enforce this
with router-level middleware plus a test that every non-public route returns 401 without
a session. No CORS middleware: all traffic is same-origin.

- Auth: `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `GET /api/auth/me`.
- Sets: `GET/POST /api/sets`, `PATCH/DELETE /api/sets/:id`, `POST /api/sets/:id/fork`.
  DELETE archives; PATCH supports unarchive as well as metadata edits.
- Cards: `GET/POST /api/sets/:id/cards`, `PUT/DELETE /api/cards/:id`.
- Images: `GET/POST /api/images` for selection/upload; `GET /images/:id` serves immutable
  artwork. Check actual image type/dimensions and bound upload size.
- Decks: `GET/POST /api/sets/:id/decks`, `GET/PUT/DELETE /api/decks/:id`,
  `POST /api/decks/:id/duplicate`, `POST /api/sets/:id/decks/generate`.
- Export: `GET /api/sets/:id/export` downloads the set package (§68).
- Rooms: `GET /api/rooms` lists live rooms from Colyseus room metadata (name, description,
  set) plus connected player count. `POST /api/rooms` creates a room (§57).
  `POST /api/rooms/:id/end` ends a room for everyone (§58).

Library mutations enforce set usage locks and expected revisions. Deck entry replacement
and set forking are transactional. Domain validation rejects cross-set deck entries;
composite foreign keys enforce the same constraint in SQLite. Upload/export can use HTTP
without introducing tabletop commands. See the workspace plan for detailed storage fields.

---

# 57. Room Creation API

Rooms are created **only** through authenticated `POST /api/rooms`. It validates the
selected set is active, calls the matchmaker's `createRoom`, reserves the creator's seat,
and returns the reservation for the client to consume. Do not allow client-side
`create("table")`: Colyseus runs `onCreate` before the joining client's `onAuth`, so
socket-side creation would let an unauthenticated request take a set usage lock. Register
set usage as part of creation, and clean up if creation fails. A room whose reserved seat
is never used must be disposed and release its lock; cover this with a test.

```ts
interface CreateRoomRequest {
  setId: CardSetId;
  name: string;
  description?: string;
}

interface CreateRoomResponse {
  roomId: RoomId;
  joinUrl: string; // /rooms/:id
}
```

Rooms exist in memory only. No persistent identity mapping or restore path is required.

---

# 58. Room Join and End Model

Join an existing Colyseus room by ID, authenticated with the account session. Validate
room existence and capacity. Do not accept a client-supplied display name or password.
A stale link reports “This room has ended”; do not use join-or-create to replace it.

Unexpected disconnect releases drag locks immediately and retains the existing reconnect
grace. The table and set usage lock remain until the room is disposed after all members
and reconnection reservations are gone. Intentional last departure ends the room without
creating a new grace reservation. Server restart ends all rooms.

Two more ways a room ends, so a forgotten tab cannot hold a set lock indefinitely:

- **Idle timeout:** no table-mutating command for `ROOM_IDLE_TIMEOUT_MINUTES` (default
  120). Claims, releases, and hover do not count as activity. Five minutes before, send
  members an ephemeral warning with **Keep open** (counts as activity) and
  **Download board image**.
- **End room:** any authenticated user, member or not, may call
  `POST /api/rooms/:id/end` after an in-page confirmation. Members are disconnected with
  “Room ended by <displayName>”, with no reconnection grace.

Every path to disposal releases the room's set usage registration.

Before the last connected participant leaves through in-app controls, show a warning with
Cancel, Download board image, and Leave room. Download does not automatically leave.
Count connections rather than UserIds. Browser-close warnings are best-effort and cannot
prevent crashes or simultaneous departures.

---

# 59. Message Naming Convention

Use one consistent naming convention.

Recommended:

```text
SCREAMING_SNAKE_CASE
```

Examples:

```text
SPAWN_CARD
MOVE_CARD
MOVE_STACK
FLIP_CARD
STACK_CARD
DRAW_CARD
```

Alternatively, lowercase kebab-case is acceptable, but do not mix styles.

Shared constants should prevent duplicated string literals across server and client.

Example:

```ts
export const Commands = {
  SPAWN_CARD: "SPAWN_CARD",
  MOVE_CARD: "MOVE_CARD",
  // ...
} as const;
```

---

# 60. Shared Package

Where practical, create a small shared package/module used by both client and server.

Example:

```text
shared/
  src/
    commands.ts
    events.ts
    ids.ts
    card-definition.ts
    protocol.ts
```

Shared content may include:

```text
command names
payload TypeScript types
Zod command schemas
enum-like constants
protocol version
```

Do not put server implementation details into the shared package.

---

# 61. Protocol Versioning

Include a simple protocol version constant.

Example:

```ts
export const PROTOCOL_VERSION = 1;
```

This is inexpensive and helps if client/server deployments later become temporarily mismatched.

The server may reject incompatible clients.

No sophisticated migration framework is required.

---

# 62. Future Tabletop Object Generalization

The initial implementation may use explicit card and stack collections.

Do not prematurely create an ECS or generic entity framework.

However, API naming should avoid assumptions that make future objects impossible.

For operations that naturally apply to more than cards, use:

```ts
type TableObjectRef =
  | {
      kind: "card";
      id: CardInstanceId;
    }
  | {
      kind: "stack";
      id: StackId;
    };
```

This can later become:

```ts
type TableObjectRef =
  | CardRef
  | StackRef
  | TokenRef
  | DieRef
  | ZoneRef
  | TextLabelRef;
```

This is particularly useful for:

```text
claiming
moving
deleting
bringing to front
selection
```

---

# 63. Future Hidden Information

The MVP does not require player-specific hidden information.

However, future card game testing may need:

```text
hands
face-down private cards
private deck inspection
player-owned zones
```

Do not assume that every object will always be visible to every client.

Future architecture may require server-side visibility filtering.

No implementation is required yet.

---

# 64. Deck Model and SPAWN_DECK

```ts
interface DeckEntry {
  cardId: CardDefinitionId;
  copies: number; // integer 1–99
}

interface DeckDefinition {
  id: DeckId;
  setId: CardSetId;
  name: string;
  description: string;
  revision: number;
  entries: DeckEntry[];
}

type SpawnDeckPayload = {
  x: number;
  y: number;
  shuffle: boolean;
  face: CardFace;
} & (
  | { source: "deck"; deckId: DeckId }
  | { source: "entries"; entries: DeckEntry[] }
);

interface DeckGenerationParams {
  size: number;
  maxCopies: number;
  includeTypes?: string[];
  seed?: string;
}
```

A deck is a persisted template, not a physical stack. Validate unique entry card IDs,
positive bounded integer counts, active definitions from exactly one set, finite world
coordinates, and the total `MAX_CARDS_PER_ROOM` capacity before mutation. A saved source
must belong to the room's set. Expand entries and optionally shuffle, creating upright
instances with the requested face in one atomic mutation. N ≥ 2 produces one stack ordered
bottom → top; N = 1 produces a standalone card; empty decks cannot be dealt.

Generation returns `{entries, seed}` without saving. Filter cards, check requested size
against eligible capacity, then pick uniformly among definitions below maxCopies. Inject
an RNG for tests. Seeds reproduce results only for identical inputs, stable ordering,
and algorithm. Quotas and weights are deferred. Decks are not covered by the set usage
lock, so generated decks can be saved during a playtest. Default dealing UI is shuffled,
face-down, at the viewport center converted to world coordinates.

---

# 65. Future Zones

Future tabletop zones may include:

```text
hand
discard
deck
play area
exile
score area
```

Zones should eventually be explicit objects rather than inferred exclusively from screen rectangles.

No zone model is required for MVP.

---

# 66. Error Handling Philosophy

Invalid operations should fail safely.

The server should:

```text
reject invalid command
preserve existing valid state
optionally send structured error
```

Do not attempt complicated conflict resolution.

For a private testing application:

```text
deterministic rejection
```

is preferable to sophisticated automatic reconciliation.

---

# 67. Logging

Server logs should include enough information to debug multiplayer state transitions.

Recommended fields:

```text
room ID
player ID
command
target object ID
validation/error result
```

Avoid logging:

```text
passwords, hashes, salts, and pepper
session/reconnect tokens
```

High-frequency `MOVE_*` commands should either:

* be omitted from ordinary info logs,
* or logged only at debug level.

---

# 68. Export Models and Persistence Boundary

Rooms have no recovery format, snapshot storage, or save command. Persist only accounts,
sessions, image metadata, sets, cards, and decks in SQLite, with immutable images on disk.

## Set package

`GET /api/sets/:id/export` downloads ZIP with `set.json` and image files. A versioned
manifest contains set descriptors, active card definitions including metadata/display
order, and saved decks with copy counts. Use export IDs for internal references and
relative archive image paths, including each image once. Read all records in one
synchronous transaction, then build the ZIP with `fflate` (images stored, JSON deflated).
Exclude accounts, sessions, rooms, and archived content. Export is allowed while locked.
A future importer can assign new database IDs; reimport UI is outside the first delivery.
CSV and printable sheets are follow-ups. This package is not a workspace backup.

## Board image

Download a PNG of the whole occupied board with padding, independent of viewport. Reuse
card rendering without changing shared state or the visible viewport. Preserve facing,
orientation, stack appearance, text, artwork, and background; omit menus, hover, selection,
and cursors. Keep face-down cards face-down. Wait for artwork, report load failures,
cap dimensions, and allow a blank image for an empty table. Filename includes room name
and timestamp. This is a local download, not a network command or restorable room save.

---

# 69. Implementation Order

Preserve existing card/stack domain behavior. Follow the workspace plan phases:

1. SQLite connection, migrations, repositories, and Docker volume.
2. Accounts, sessions, authenticated HTTP/room access, and login UI.
3. Sets/cards/images, importer/cache, editors, room set binding, and set usage locks.
4. Deck CRUD/generation, atomic spawning, and set forks.
5. Live-room browser/descriptors, idle timeout, End room, last-person warning, set export,
   and board PNG.
6. Deployment and backup/restore documentation for the persistent library.

Test domain invariants, atomic deck dealing, cross-set rejection, stale library writes,
and usage-lock cleanup across multiple rooms, reconnect, idle timeout, End room, and
never-joined rooms. Test that unauthenticated requests are rejected on every non-public route. Export checks should
verify card/deck references and packaged images. Room persistence tests are unnecessary.

---

# 70. Workspace Table Protocol

The workspace tabletop protocol includes:

```ts
type CommandType =
  | "SESSION"     // returns the caller's PlayerId
  | "SET_HOVER"   // presence: card under this player's pointer

  | "SPAWN_CARD"
  | "SPAWN_DECK"
  | "UPDATE_ROOM_METADATA"
  | "SHUFFLE_STACK"

  | "CLAIM_OBJECT"
  | "RELEASE_OBJECT"

  | "MOVE_CARD"
  | "MOVE_STACK"

  | "FLIP_CARD"
  | "TAP_CARD"
  | "UNTAP_CARD"

  | "STACK_CARD"
  | "DRAW_CARD"

  | "DELETE_CARD"
  | "DELETE_STACK"

  | "BRING_TO_FRONT";
```

Later:

```ts
type FutureCommandType =
  | "REVERSE_STACK"
  | "SPLIT_STACK"
  | "MERGE_STACKS"
  | "DRAW_MULTIPLE"

  | "UPDATE_CURSOR"
  | "ADD_TEMPORARY_STROKE"

  | "ROLL_DIE"
  | "CREATE_TOKEN";
```

---

# 71. Example State

Conceptually:

```json
{
  "setId": "set-skirmish",
  "name": "Tuesday playtest",
  "description": "Balance testing",
  "players": {
    "player-1": {
      "id": "player-1",
      "displayName": "Alice",
      "userId": "user-alice",
      "connected": true
    },
    "player-2": {
      "id": "player-2",
      "displayName": "Bob",
      "userId": "user-bob",
      "connected": true
    }
  },

  "cards": {
    "card-1": {
      "id": "card-1",
      "definitionId": "spell-001",
      "face": "front",
      "orientation": "upright",
      "x": 420,
      "y": 300,
      "stackId": null,
      "zIndex": 14
    },

    "card-2": {
      "id": "card-2",
      "definitionId": "unit-004",
      "face": "back",
      "orientation": "upright",
      "x": 800,
      "y": 400,
      "stackId": "stack-1",
      "zIndex": 0
    },

    "card-3": {
      "id": "card-3",
      "definitionId": "unit-005",
      "face": "back",
      "orientation": "upright",
      "x": 800,
      "y": 400,
      "stackId": "stack-1",
      "zIndex": 0
    }
  },

  "stacks": {
    "stack-1": {
      "id": "stack-1",
      "x": 800,
      "y": 400,
      "cardIds": [
        "card-2",
        "card-3"
      ],
      "zIndex": 20
    }
  }
}
```

Note that card coordinates inside a stack are not authoritative.

They may be ignored while `stackId !== null`.

---

# 72. Example Interaction

Alice drags `card-1` onto `stack-1`.

Sequence:

```text
Alice
↓
CLAIM_OBJECT(card-1)

Server
↓
grants card-1 lock

Alice moves card
↓
MOVE_CARD(card-1, x, y)
MOVE_CARD(card-1, x, y)
MOVE_CARD(card-1, x, y)

Other clients
↓
render synchronized motion

Alice drops over stack-1
↓
STACK_CARD(
    card-1,
    target = stack-1
)

Server
↓
validate:
    card exists
    stack exists
    Alice owns card
    stack not conflicting
    card face matches stack top face

Server atomically:
    removes standalone card semantics
    sets card-1.stackId = stack-1
    appends card-1 to stack.cardIds
    releases card lock

All clients
↓
render card-1 as new top card
```

---

# 73. Non-Goals

The domain/API layer should **not** initially implement:

```text
card game rules
turn order
mana/resources
win conditions
combat
automatic scoring
rule validation
AI players
automatic matchmaking
persistent rooms
per-user ownership/access permissions
CRDT synchronization
P2P networking
arbitrary undo/redo
complex transactional history
```

The application represents a shared physical tabletop, not a digital implementation of the game rules.

---

# 74. Final Architectural Rule

When deciding whether a behavior belongs on the client or server, use this guideline:

```text
Does this affect what the shared tabletop IS?
    → server-authoritative state

Does this affect what other players are temporarily DOING?
    → ephemeral shared presence/event

Does this affect only how one player SEES or controls their UI?
    → local client state
```

Examples:

```text
card position
→ server

stack order
→ server

card face
→ server

cursor
→ ephemeral

temporary pen stroke
→ ephemeral

magnified preview
→ local

browser menu open
→ local

camera zoom
→ local
```

This separation should remain the central organizing principle as the application expands.
