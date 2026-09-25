# Post-MVP refactoring targets

Assessed against the files as they stand at the end of the MVP sprint, ahead of
post-MVP features (hands, zones, decks, annotations).

Current sizes:

```text
client/src/multiplayer/MultiplayerContext.tsx   341 lines
client/src/tabletop/Table.tsx                   257 lines
server/src/rooms/TableRoom.ts                   263 lines (onCreate: 77)
shared/src/commands.ts                          131 lines
```

Two files have genuinely accumulated unrelated responsibilities. The other two
are large but internally uniform, and splitting them now would cost more than it
returns. Each deferred item below carries the trigger that should reopen it.

---

## Recommended

### 1. Extract `<TableContextMenu />` from `Table.tsx`

**Why:** Roughly 70 lines of React DOM live inside a component otherwise about
Konva rendering. It holds the densest branching in the file — card items versus
stack items — and its four handlers treat rejection inconsistently: two use
`.catch()` with a warning, two are bare `void`. Nothing can test it without
mounting a whole `Stage`.

**Shape:** A DOM component taking the live menu card, the optional stack, and
the commands it invokes. Menu state (`cardMenu`) stays in `Table`, since the
Konva handlers set it.

**Payoff:** The inconsistent rejection handling becomes visible and fixable in
one place, and the menu gains tests. Hands and zones will each add menu items,
so this seam only gets more valuable.

### 2. Extract `<SnapTargetOutline />` from `Table.tsx`

**Why:** It is an IIFE inside JSX that re-derives its own target by searching
both the card and stack arrays — a smell independent of file size.

**Shape:** A Konva component taking the resolved target object and drawing the
outline. Resolution moves next to `findStackTarget` in `snap-detection.ts`.

**Payoff:** ~15 lines out of `Table`, and the outline geometry becomes testable
without a canvas.

**Do together with item 6** — the same code is open.

### 3. Extract `useRoomSync(room)` from `MultiplayerContext.tsx`

**Why:** `syncState` is mechanical `RoomState` → React array mapping with no
relationship to the connection lifecycle around it. It grows by one block per
synchronized entity, and hands, zones, and decks each add one.

**Shape:** A hook owning the `cards`/`stacks`/`players`/`hostPlayerId` state and
the `onStateChange` subscription, returning them to the provider.

**Payoff:** The clearest seam in the file, and the one that would otherwise grow
fastest.

### 4. Extract `useTableCommands(room)` from `MultiplayerContext.tsx` — one context, not two

**Why:** The 14 command wrappers are one-liners over
`client/src/multiplayer/commands.ts`, which is already the command layer. They
exist only to bind `roomRef` and the not-connected error, so they are bulk
rather than logic.

**Explicitly not recommended:** splitting the provider into `ConnectionContext`
plus a table context. Consumers want both halves — `Table` needs `cards` *and*
`flipCard`, the lobby needs `status` *and* `createRoom` — and both halves change
on the same updates, so two providers buy two `useContext` calls and a
provider-ordering constraint for no rendering benefit. The problem here is file
size, not context shape.

**Payoff:** With items 3 and 4 done, `MultiplayerContext.tsx` lands near 200
lines and is about connection lifecycle only: the reconnection token, the grace
period, and the deliberate no-leave-on-unmount behaviour — the subtlest code in
the client, currently buried among mapping and wrappers.

---

## Worth fixing while nearby

### 5. The context value re-creates on every patch

`MultiplayerContext`'s memo depends on `cards` and `stacks`, so every consumer
re-renders on every state patch — roughly 20 Hz for the duration of any drag.
This costs more than any line count on this page, and note that item 4's
rejected two-context split would *not* fix it: both contexts would change
together.

The fix is stable command identities plus selector-style subscription, so a
consumer re-renders only for the slice it reads.

**Not yet.** There is no observed jank at prototype scale. This is the item most
likely to eventually bite, so it is recorded rather than scheduled.

### 6. `Table.tsx` identifies the dragged card by arbitrary map entry

```ts
const active = Object.entries(drag.localPositions)[0];
```

This stands in for "the card currently being dragged" and works only because
there is one pointer. It is wrong by construction; a second local drag or a
multi-touch pointer would snap against the wrong card. `useCardDrag` should
expose the active drag explicitly instead.

**Do together with item 2**, which opens the same code.

---

## Deferred, with triggers

### 7. `<TableObjects />` sub-component

The sorted card-and-stack map is the component's actual job. Extracting it means
threading roughly a dozen props across a new boundary — both drag APIs,
definitions, the menu setter, the magnify handlers — which is a prop-drilling
tax for a cosmetic gain. With items 1 and 2 done, `Table.tsx` sits near 170
lines and the mapping reads fine.

**Trigger:** a second object layer (zones are the likely one), or the prop list
shrinking enough that the boundary is cheap.

### 8. `registerTableCommands()` in a `command-registry.ts`

`onCreate` is 77 lines, about 60 of them registrations, and those registrations
are already the thin part: one to three lines each, no logic. That is a routing
table, not a God object.

Extraction also does not cleanly separate anything. The registrations need
`state`, `lockTimeoutMs`, `cardDefinitionIds`, `playerIdBySessionId`,
`rateLimiter`, and `onMessage`, so a free function either takes the room — in
which case the separation is cosmetic and those fields stop being private — or
takes a six-field config object that must be kept in sync. Both are worse than
the current flat, uniform block.

**Trigger:** registrations passing roughly 100 lines. The right cut then is by
domain — `registerCardCommands(command)`, `registerStackCommands(command)`,
taking the existing `command` helper as an argument. That preserves
encapsulation and is a much smaller change than a registry module.

### 9. Splitting `shared/src/commands.ts` by domain

131 lines, flat, no logic, and no internal coupling to untangle — a list of
schema/type/result triples. Three files plus a barrel adds an index to maintain
and a hop when reading, against a speculative future bottleneck. `AGENTS.md`
calls for a small shared module and concrete abstractions driven by current
requirements.

**Trigger:** roughly 300 lines, or two domains needing genuinely different
schema helpers.

Two small placement oddities are worth folding into any future edit of the file:
`WORLD_COORDINATE_LIMIT` is a domain bound sitting in a commands file, and
`objectLockKey` is a function in a file otherwise holding schemas.

---

## Suggested order

```text
1 ─┐
2 ─┼→ Table.tsx ≈ 170 lines
6 ─┘

3 ─┐
4 ─┴→ MultiplayerContext.tsx ≈ 200 lines, connection lifecycle only
```

Items 1–4 and 6 are roughly a day's work together. Items 5 and 7–9 stay on this
page until their triggers fire.
