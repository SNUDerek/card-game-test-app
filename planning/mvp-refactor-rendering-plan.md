# MVP Refactor Item 5: Selector-Based Multiplayer Subscriptions

## Goal

Prevent unrelated multiplayer consumers from re-rendering on every Colyseus
state patch.

Today, `useRoomSync()` recreates the `cards`, `stacks`, and `players` arrays on
every patch. Those values are included in `MultiplayerContext`'s memoized value,
so the context value changes and every `useMultiplayer()` consumer re-renders.
During a drag this can happen at roughly 20 Hz, even for consumers that only
read connection status or player information.

The desired behavior is:

- `Table` updates when cards or stacks change.
- `RoomHud` updates when room or player information changes.
- `Lobby` and `Session` update when connection state changes.
- Consumers do not update when an unrelated slice changes.
- Command function identities remain stable across state patches.

## Proposed Design

Use React's built-in `useSyncExternalStore` with a small client-side
multiplayer store. No additional state-management dependency is needed.

The context should provide a stable store/controller object rather than the
current changing state snapshot. Consumers subscribe through a selector hook:

```ts
const cards = useMultiplayerSelector((state) => state.cards);
const status = useMultiplayerSelector((state) => state.status);
```

Commands already have stable identities through `useTableCommands()` and can
remain available through a stable command/controller API.

This does not change which state is authoritative. The server remains the
source of truth, and the client store remains only a React-facing mirror of
the latest synchronized room state and connection lifecycle.

## Implementation Steps

### 1. Define the store snapshot and API

Add a multiplayer store module containing:

- the full client snapshot type,
- the disconnected initial snapshot,
- `getSnapshot()`,
- `subscribe(listener)`,
- narrowly scoped update operations,
- a reset operation.

The snapshot should contain the existing context state:

- connection status,
- room and invited-room IDs,
- self and host player IDs,
- players,
- cards,
- stacks,
- connection error.

Lifecycle and command functions should not be copied into each snapshot.

### 2. Preserve unchanged slice identities

Update room synchronization so a patch does not automatically replace every
array.

When copying Colyseus schema values into plain client data:

- compare the new cards with the previous cards,
- compare the new stacks with the previous stacks,
- compare the new players with the previous players,
- retain the previous array reference when its contents are unchanged,
- retain the previous snapshot when no slice changed.

This reference preservation is required for selector subscriptions to work.
For example, a player selector must receive the same `players` reference during
a card-only movement patch.

Comparisons should cover all rendered fields, including stack card order and
player connection state. Keep player sorting by `joinOrder`.

### 3. Adapt room synchronization

Refactor `useRoomSync()` or replace it with an equivalent room-to-store bridge.
It should:

- synchronously copy the initial `room.state` during attachment,
- subscribe to later `onStateChange` patches,
- publish synchronized slices through the store,
- reset synchronized state on leave or connection failure,
- preserve the current reload/reconnection behavior.

Avoid introducing a delayed effect for initial attachment; the first connected
render should still receive the room's current state immediately.

### 4. Stabilize the context value

Change `MultiplayerContext` so its provided value has stable identity across
store updates. It should expose only stable infrastructure, such as:

- the store subscription interface,
- stable lifecycle commands (`createRoom`, `joinRoom`, and `leaveRoom`),
- stable table commands from `useTableCommands()`.

Connection and room state changes should publish to the store rather than
rebuilding the context value.

Retain the existing lifecycle rules:

- the server remains authoritative,
- stored reconnection tokens are cleared at the same times,
- an intentional leave still resets the URL and invited-room state,
- provider unmount must not call `room.leave()`,
- stale asynchronous identity responses must not update a newer room.

### 5. Add selector hooks

Provide a typed hook similar to:

```ts
function useMultiplayerSelector<T>(
  selector: (state: MultiplayerSnapshot) => T,
): T;
```

Implement it with `useSyncExternalStore`.

Selectors should normally return a primitive or a stable snapshot field.
Avoid selectors that construct a new object or array on every call. If a
consumer genuinely needs several fields together, either subscribe to them
separately or provide an explicit equality/memoization mechanism.

Retain a separate hook for stable commands/controller access if that keeps the
consumer API clearer than mixing commands into state selectors.

### 6. Migrate consumers

Update each consumer to subscribe only to what it reads:

- `Session`: connection status.
- `Lobby`: status, invited room ID, connection error, and create/join commands.
- `RoomHud`: room ID, players, host player ID, self player ID, and leave command.
- `Table`: cards, stacks, connection error, and table commands.

`Table` is expected to re-render during card and stack movement. The primary
optimization is preventing those patches from also re-rendering unrelated DOM
UI.

### 7. Add focused tests

Add store and integration-style hook/component tests that verify:

- card changes notify card subscribers,
- card-only changes do not notify player or connection subscribers,
- player changes notify player subscribers,
- connection changes notify connection subscribers,
- identical synchronized data preserves slice references,
- stack card-order changes are detected,
- player connection-state changes are detected,
- command identities remain stable through patches,
- the initial room state is available synchronously,
- reset, leave, failed connection, and reconnect paths publish the correct
  snapshots.

Add render-count tests around representative consumers or small test consumers
to prove that a card movement does not re-render a status-only or players-only
subscriber.

### 8. Verify the completed refactor

Run:

```text
npm run typecheck
npm test
npm run build
```

Also manually verify:

- creating and joining a room,
- reloading and reconnecting,
- dragging cards and stacks,
- player join/disconnect/reconnect display,
- intentional leave,
- command behavior while connected and disconnected.

React Profiler can be used to confirm that `Lobby` and `RoomHud` no longer
render during card-only drag patches.

## Likely Files

Expected new or substantially changed files:

- `client/src/multiplayer/MultiplayerContext.tsx`
- `client/src/multiplayer/useRoomSync.ts`
- a new multiplayer store/selector module and its tests
- `client/src/App.tsx`
- `client/src/features/lobby/Lobby.tsx`
- `client/src/features/room/RoomHud.tsx`
- `client/src/tabletop/Table.tsx`

Existing command transport and server code should not need behavioral changes.

## Non-Goals

- Do not add Redux, Zustand, or another state-management library.
- Do not change the server-authoritative multiplayer model.
- Do not synchronize local-only UI state.
- Do not change command payloads or wire protocol behavior.
- Do not combine this work with hands, zones, decks, or other new features.
- Do not optimize `Table` out of rendering when card or stack data actually
  changes.

## Completion Criteria

The refactor is complete when:

- the context-provided infrastructure remains stable during room patches,
- consumers subscribe through typed selectors,
- unchanged slices preserve reference identity,
- card-only patches do not re-render connection-only or player-only consumers,
- all connection, reconnection, leave, and command behavior remains intact,
- type checking, tests, and production build pass.
