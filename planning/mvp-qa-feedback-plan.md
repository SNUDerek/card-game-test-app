# QA feedback: implementation plan

Derived from [mvp-qa-testing-feedback.md](mvp-qa-testing-feedback.md), assessed
against the code as it stands after the MVP refactor sprint.

Eight requests, spanning one genuine bug, four small tweaks, and three new
features. They are not equal in size: the cursor item is larger than the other
seven combined, and one of them (magnify) is really a small interaction
redesign rather than a settings change.

| # | Item | Kind | Effort | Risk |
|---|------|------|--------|------|
| 1 | Catalog single-column layout | tweak | S | low |
| 2 | Drag-release bounce | **bug** | S | low |
| 3 | Card border + padding | visual | S | low |
| 4 | Magnify → menu action, 2×, over source | redesign | M | medium |
| 5 | Stack shuffle | feature | M | low |
| 6 | App-level password gate | feature | M | medium |
| 7 | Presence: cursors / ping / pen | feature | L | high |

Recommended order is at the bottom; it is not the order above.

---

## 1. Catalog: single column, image left, text right

**Asked:** one column instead of two, image left with id and name right,
drag restricted to the image, must scroll for more than ~16 cards.

**Now:** [CardBrowser.tsx:73-105](client/src/features/card-browser/CardBrowser.tsx#L73-L105)
renders `.card-browser-grid` as a CSS grid
(`repeat(auto-fill, minmax(180px, 1fr))`,
[CardBrowser.css:123-130](client/src/features/card-browser/CardBrowser.css#L123-L130))
with each `<article>` a vertical card: image on top, then name/type/body/id.
The whole `<article>` carries `draggable` and the `onDragStart` handler.

**Change:**

- CSS: `.card-browser-grid` becomes a single-column flex/grid list;
  `.card-browser-item` switches to a horizontal row (`flex-direction: row`),
  `.card-image` gets a fixed width rather than `width: 100%`.
- JSX: move `draggable` and `onDragStart` from the `<article>` onto the
  `<img>`. Keep `CARD_DEFINITION_MIME_TYPE` and the payload unchanged, so
  [Table.tsx:91-110](client/src/tabletop/Table.tsx#L91-L110) needs no edit.
- Decide what the right-hand column shows. QA says "id and name"; the panel
  currently also shows type and a 3-line-clamped body. Dropping body/type is a
  content decision, not a technical one — see open questions.

**Scrolling already works.** `.card-browser-grid` is `flex: 1; overflow-y:
auto` inside a `display: flex; flex-direction: column` panel with a bottom
anchor, so it scrolls at any card count. Nothing in the code assumes 16 cards.
Worth confirming against a large catalog during QA, but no change is planned.

**Tests:** [CardBrowser.test.tsx:52-58](client/src/features/card-browser/CardBrowser.test.tsx#L52-L58)
asserts on `getAllByRole("article")` and their `textContent`. Keeping the
`<article>` element keeps the query valid; the `textContent` expectations
change if the body/type text is dropped.

---

## 2. Drag-release bounce — a real bug, root cause found

**Asked:** stop the little "bounce" when releasing a dragged card.

**Cause.** [Table.tsx:151-152](client/src/tabletop/Table.tsx#L151-L152) picks a
card's render position in this order:

```ts
drag.localPositions[card.id] ?? interpolatedPositions[card.id] ?? { x: card.x, y: card.y }
```

During a local drag, `localPositions` wins and the card tracks the pointer.
Meanwhile [useInterpolatedCardPositions](client/src/tabletop/interactions/interpolation.ts#L15-L47)
keeps running for *every* card including the dragged one, re-seeding on each
`cards` patch and animating toward the server position — which lags the pointer
by up to `MOVE_INTERVAL_MS` (50 ms) plus round-trip.

On release, [Table.tsx:62-69](client/src/tabletop/Table.tsx#L62-L69) clears the
local position as soon as the server echoes the final coordinates. Rendering
then falls through to `interpolatedPositions`, which at that instant is still
mid-flight from a *stale* position. The card snaps backward to that stale point
and slides forward again — the observed bounce.

**Fix:** exclude locally-controlled cards from interpolation and keep their
interpolated entry pinned to the local position, so the handoff when
`localPositions` clears is a no-op. Concretely, pass the dragged card ids into
`useInterpolatedCardPositions` and have it snap (not animate) those entries.

**Also worth fixing while in the file:** the effect depends on the `cards` array
identity, so every patch restarts a full `requestAnimationFrame` loop that
rebuilds an `Object.fromEntries` over all cards on every frame. This is
independent of the bounce and is the cheapest performance win in the client.

**Stacks are not affected.** [stack-drag.ts:32-39](client/src/tabletop/interactions/stack-drag.ts#L32-L39)
clears its local position after the confirmed move and
[Table.tsx:133](client/src/tabletop/Table.tsx#L133) falls back to the raw stack
position with no interpolation layer, so there is no stale intermediate to snap
to. If a bounce is observed on stacks too, it is a different bug — capture a
repro.

**Tests:** extend [interpolation.test.ts](client/src/tabletop/interactions/interpolation.test.ts)
with a case asserting a locally-dragged card is not interpolated, and that the
transition off a local position does not move the card.

---

## 3. Darker card border and padding

**Asked:** darker (black?) border, small padding around borders.

**Now:** [CardRenderer.tsx:64-75](client/src/cards/CardRenderer.tsx#L64-L75)
strokes the face-up card `#cbd5e1` at `strokeWidth: 1`. Art is flush to the
card edge (`x: 0, width: CARD_WIDTH`,
[CardRenderer.tsx:77-98](client/src/cards/CardRenderer.tsx#L77-L98)); text is
inset 10px.

**Change:** darken the outer `stroke` (`#0f172a` reads as black without going
pure), consider `strokeWidth: 2`, and inset the art group so it no longer
touches the border.

**Constraint — do not change `CARD_WIDTH` / `CARD_HEIGHT`.** Those constants
are imported by [MagnifyPreview.tsx](client/src/features/tabletop/MagnifyPreview.tsx#L3-L9),
[Card.tsx](client/src/tabletop/Card.tsx#L26-L27) (centering offsets), and
[snap-detection.ts](client/src/tabletop/interactions/snap-detection.ts) (hit
geometry). Padding must come out of the interior — reduce `ART_HEIGHT` /
inset the art — or snap targets and stack alignment shift underneath the
change. `BODY_HEIGHT` is derived from `ART_HEIGHT`, so re-check text fitting
([fit-text.ts](client/src/cards/fit-text.ts)) if art height moves.

Apply the same treatment to the card back
([CardRenderer.tsx:27-59](client/src/cards/CardRenderer.tsx#L27-L59)) so
face-down cards match.

---

## 4. Magnify: menu action, 2×, drawn over the source card

**Asked:** (a) move it into the right-click menu where Tap lives, (b) reduce
4× to 2×, (c) draw over the source card and dismiss when the mouse leaves.

**Note:** the current scale is **3×**, not 4× —
[`MAGNIFY_SCALE = 3`](client/src/state/local-ui-state.ts#L9). Changing it to 2
is a one-line edit and the comment there says the spec allows 2–4×.

**Now:** magnification is hover-driven end to end.
[Card.tsx:61-62](client/src/tabletop/Card.tsx#L61-L62) and
[Stack.tsx:38-39](client/src/tabletop/Stack.tsx#L38-L39) fire
`onHoverStart`/`onHoverEnd` into
[`useLocalUiState`](client/src/state/local-ui-state.ts#L28-L43), and
[Table.tsx:47-60](client/src/tabletop/Table.tsx#L47-L60) resolves the card and
picks a side via `getPreviewSide`, which deliberately parks the preview on the
*opposite* half of the table
([MagnifyPreview.tsx:27-29](client/src/features/tabletop/MagnifyPreview.tsx#L27-L29)).
The overlay is positioned by fixed left/right offsets
([MagnifyPreview.css:18-24](client/src/features/tabletop/MagnifyPreview.css#L18-L24)).

**This is three changes, not one:**

1. **Trigger.** Add a "Magnify" item to
   [TableContextMenu](client/src/tabletop/TableContextMenu.tsx) alongside Tap.
   Unlike every other item there, it is local-only — it takes no command and
   sends nothing, so it needs a new prop (an `onMagnify` callback) rather than
   joining the `commands` object. Keep that boundary clean; the menu's existing
   props are all server commands.
2. **Placement.** `getPreviewSide` and the `magnify-preview-left/right` classes
   become obsolete: the preview now needs the card's screen rect and absolute
   positioning centred on it. `Table` already computes the card's screen centre
   ([Table.tsx:53-59](client/src/tabletop/Table.tsx#L53-L59)) for the side
   calculation, so the input exists — it becomes `left`/`top` instead. Add
   viewport clamping so a card near an edge does not push the preview off
   screen.
3. **Dismissal.** Hover-out no longer applies once the trigger is a menu
   action. The preview has `pointer-events: none`, so pointer events reach the
   card underneath and a `mouseleave` on the source card can still dismiss it.
   At 2× the preview is larger than the card, so the pointer will often sit
   over the preview but *outside* the card — see open questions.

**Cleanup:** with hover no longer triggering magnification, `onHoverStart` /
`onHoverEnd` on `Card` and `Stack` and the `magnifyCard`/`unmagnifyCard` hover
semantics in `local-ui-state` are unused. Remove them rather than leaving dead
props, and simplify `clearMagnifiedCardId` (its out-of-order-hover guard exists
only to serve hover).

**Tests:** [MagnifyPreview.test.tsx:33-38](client/src/features/tabletop/MagnifyPreview.test.tsx#L33-L38)
covers `getPreviewSide` and will be deleted with it;
[local-ui-state.test.ts](client/src/state/local-ui-state.test.ts) covers the
hover-order guard and needs rewriting for toggle semantics. Add a
`TableContextMenu` case asserting Magnify issues no command.

---

## 5. Shuffle in the stack context menu

**Asked:** enable shuffle from the stack right-click menu.

**Shape** — a normal end-to-end command, following the existing pattern
exactly:

- `shared`: add `SHUFFLE_STACK` to `TABLE_COMMANDS`
  ([commands.ts:4-18](shared/src/commands.ts#L4-L18)); reuse
  `StackIdPayloadSchema` ([commands.ts:122](shared/src/commands.ts#L122)); add
  a `ShuffleStackResult`.
- `server`: new `shuffleStack()` in
  [server/src/commands/stack/](server/src/commands/stack/), alongside
  [draw-top-card.ts](server/src/commands/stack/draw-top-card.ts). It must call
  `rejectForeignLock` for the stack, verify membership consistency the way
  `drawTopCard` does ([draw-top-card.ts:23-27](server/src/commands/stack/draw-top-card.ts#L23-L27)),
  then Fisher-Yates the `cardIds` array in place.
- `TableRoom`: one `this.command(...)` registration
  ([TableRoom.ts:186-196](server/src/rooms/TableRoom.ts#L186-L196) is the
  neighbourhood).
- `client`: one wrapper in [commands.ts](client/src/multiplayer/commands.ts),
  one in [useTableCommands.ts](client/src/multiplayer/useTableCommands.ts), one
  menu button in [TableContextMenu.tsx](client/src/tabletop/TableContextMenu.tsx)
  behind the existing `{stack && ...}` guard.

**Domain notes:**

- Shuffle reorders `cardIds` only. Per-card `face` and `orientation` travel
  with the card, so a stack of mixed face-up/face-down cards stays mixed —
  correct, and worth stating in the function's comment.
- The top card changes, so the rendered stack changes appearance
  ([Stack.tsx:24](client/src/tabletop/Stack.tsx#L24) reads `cardIds.at(-1)`).
  That is the point of the feature.
- Randomness lives server-side. Do not let the client supply a permutation or a
  seed.
- No `collapseStackIfNeeded` call is needed — shuffling cannot change stack
  size — but the ≥2 invariant should still be asserted.

**Tests:** [stack-manipulation.test.ts](server/src/commands/stack/stack-manipulation.test.ts)
is the right home. Cover: membership preserved as a multiset, length unchanged,
foreign lock rejected, inconsistent membership rejected. Inject the RNG so the
permutation is deterministic under test.

---

## 6. App-level password gate

**Asked:** simple password prompt (set via config) before the create/join page,
to discourage the curious. Explicitly *not* real auth.

**Do not confuse this with the existing per-room password.** That already
exists and works: [room-access.ts](server/src/rooms/room-access.ts) hashes with
scrypt and verifies in [`onAuth`](server/src/rooms/TableRoom.ts#L200-L206), and
[Lobby.tsx:80-90](client/src/features/lobby/Lobby.tsx#L80-L90) collects it.
This request is a second, *global* gate in front of the lobby itself.

**Shape:**

- Server: read a gate password from env in
  [config/env.ts](server/src/config/env.ts) (e.g. `APP_PASSWORD`), unset =
  disabled.
- Enforce it in `TableRoom.onAuth`, which is already the choke point for both
  create and join and already throws `ServerError(401)`. Extend
  `JoinRoomOptionsSchema` ([room.ts:13-16](shared/src/room.ts#L13-L16)) with
  the gate password, or send it as a separate option.
- Client: a gate screen in front of `<Lobby />` in
  [App.tsx:8-20](client/src/App.tsx#L8-L20), holding the entered value (session
  storage, so a reload during testing is not painful) and passing it into the
  create/join requests.

**Two things to be honest about in the implementation:**

1. A client-side-only gate is bypassed by anyone who opens devtools. Enforcing
   in `onAuth` is what makes it meaningful, so the client screen is UX and the
   server check is the gate. Build both or it is theatre.
2. `GET /api/cards` ([routes.ts:5-10](server/src/http/routes.ts#L5-L10)) and
   the card image assets stay open regardless. If the intent includes "don't
   let strangers browse my card designs", that route needs the same check —
   which means the client must send the gate value on the catalog fetch too.
   Worth deciding now; it changes
   [CardCatalogContext](client/src/features/card-browser/CardCatalogContext.tsx).

Keep the scrypt hashing for the room password; for a config-set gate value a
constant-time compare against the env string is sufficient and simpler.

---

## 7. Presence: live cursors, or ping, or fading pen

**Asked:** live cursors preferred; if too heavy, a double-click ping or a
Meet-style fading pen.

This is the largest item and the only one that touches the multiplayer model.
`AGENTS.md` explicitly lists cursors, temporary pen strokes and presence as
**shared ephemeral state** and names them as likely future features, so this is
sanctioned — but the transport choice matters a lot.

**Recommendation: broadcast messages, not room state.**

Putting cursors in `RoomState` ([RoomState.ts:53-67](server/src/rooms/state/RoomState.ts#L53-L67))
would mean a synchronized schema field mutating at ~20 Hz per connected player.
Every such patch fires `onStateChange`
([useRoomSync.ts:29-67](client/src/multiplayer/useRoomSync.ts#L29-L67)), which
rebuilds the context value and re-renders *every* `useMultiplayer()` consumer —
the exact problem [mvp-refactor-item-5-plan.md](mvp-refactor-item-5-plan.md)
exists to solve. Cursors also do not belong in the authoritative snapshot: they
are not part of what the tabletop *is*, and a reconnecting client should not
receive a replay of where someone's mouse was.

Instead: a relay message (`CURSOR` / `PING` / `STROKE`) that the server
validates, stamps with the sender's `PlayerId`, and broadcasts without storing.
Client-side, hold it in a dedicated presence store separate from
`MultiplayerContext`, so cursor traffic never re-renders the tabletop or HUD.

**This is the trigger the item-5 plan was waiting for.** That document deferred
selector-based subscriptions for want of observed jank. Live cursors are the
first feature that would create it. Keeping presence off room state and out of
the multiplayer context sidesteps the dependency — but if presence is ever put
*into* room state, item 5 becomes a prerequisite, not an option.

**Scope ladder, cheapest first.** These are genuinely different sizes; pick one
rather than planning all three:

- **Ping (S).** Double-click on empty table broadcasts one world-coordinate
  point; all clients draw an expanding ring for ~1 s. No throttling, no
  per-player state, no lifecycle. Note the conflict: double-click on a *card*
  already flips it ([Card.tsx:69-70](client/src/tabletop/Card.tsx#L69-L70)), so
  the ping must bind to the background `Rect`
  ([Table.tsx:116](client/src/tabletop/Table.tsx#L116)) only — which QA's "off
  card" phrasing already anticipates.
- **Live cursors (M).** Throttled ~20 Hz pointer broadcast in world
  coordinates, a Konva presence layer drawing a labelled pointer per player,
  and staleness handling (drop a cursor after ~2 s of silence, and on
  disconnect). Reuse the `MOVE_INTERVAL_MS` throttle shape from
  [drag.ts:21-23](client/src/tabletop/interactions/drag.ts#L21-L23). Rate
  limiting needs thought: [CommandRateLimiter](server/src/rooms/rate-limit.ts)
  currently governs commands, and a 20 Hz cursor stream per player will
  interact with that budget.
- **Fading pen (L).** Everything cursors need, plus stroke batching, a fade
  lifecycle, and a tool mode in the UI. Largest of the three; least clearly
  requested.

**Recommendation:** ship the ping first. It delivers most of the "where is
everyone looking" value for a fraction of the work, and it builds the relay
plumbing that cursors would reuse — so it is a genuine stepping stone, not
throwaway work.

---

## Suggested order

```text
2 ─→ bounce         (bug; smallest real defect on the list)
1 ─┬→ catalog       (independent, low risk)
3 ─┘  card border   (independent, low risk — watch the geometry constants)

5 ─→ shuffle        (self-contained vertical slice; good shakedown of the
                     command pattern before anything harder)

4 ─→ magnify        (interaction redesign; touches Table, local-ui-state,
                     the context menu, and deletes two test files' subjects)

6 ─→ password gate  (needs the open questions answered first)

7 ─→ presence       (largest; start with ping)
```

Items 1–3 are roughly an afternoon together. Item 5 is a half-day. Items 4 and
6 are each about a day once their open questions are settled. Item 7 is its own
piece of work and should get its own plan document before implementation.

---

## Open questions

These change the work and are worth settling before starting the item in
question:

1. **Catalog rows (item 1).** QA asks for "id and name" on the right. Drop the
   type and body text currently shown, or keep them? Dropping them changes the
   existing test expectations; keeping them makes rows tall enough that fewer
   fit on screen, which works against the single-column request.
2. **Magnify dismissal (item 4).** "Disappear when the mouse is moved off it" —
   off the *card*, or off the *preview*? At 2× the preview is strictly larger
   than the card, so "off the card" means it dismisses while the pointer is
   still visually over the preview. Off the preview is likely what feels right,
   but it is not what the sentence says.
3. **Magnify while it is open (item 4).** Does clicking elsewhere, dragging, or
   opening another card's menu dismiss it? Currently hover-out handled all of
   this implicitly.
4. **Gate scope (item 6).** Does the gate cover the card catalog API and image
   assets, or only room create/join? This decides whether the client must send
   the gate value on every asset fetch.
5. **Presence tier (item 7).** Confirm ping-first, or commit to full cursors
   knowing it is several times the work.

---

## Presence Options (Item 7) Research

Based on the architectural decision to keep ephemeral presence data out of `RoomState`, here are the detailed implementation options utilizing relay messages (`room.broadcast()` / `room.onMessage()`):

### Option 1: The "Ping" (Smallest Effort)
When a user double-clicks on the empty background, broadcast a `PING` message with `(x, y)` coordinates.
* **Mechanism:** Other clients receive the ping and draw a Konva `Ring` or `Circle` that expands and fades out over ~1 second.
* **Packages needed:** None.
* **Pros:** Extremely easy to implement, lightweight on network traffic, no conflict with rate limiters.
* **Cons:** Doesn't provide real-time tracking, just point-in-time attention.

### Option 2: Live Cursors (Medium Effort)
Broadcast the user's pointer coordinates at ~20Hz.
* **Mechanism:** Render cursors in an overlay or dedicated Konva layer, completely separate from card rendering. Include a routine to fade out cursors inactive for 2+ seconds.
* **Packages needed:** [`perfect-cursors`](https://www.npmjs.com/package/perfect-cursors) (provides spline interpolation to smooth network latency and jitter).
* **Pros:** Standard collaborative UX; `perfect-cursors` makes it look smooth and professional.
* **Cons:** Requires managing the Colyseus `CommandRateLimiter` to ensure 20Hz cursor messages don't exhaust the command budget.

### Option 3: Fading Pen / Laser Pointer (Largest Effort)
A temporary drawing tool (like a Google Meet laser pointer).
* **Mechanism:** As the user drags the mouse, collect a batch of points and broadcast them. Render the resulting polygon via a Konva `Path`, and animate its opacity to `0` over ~2 seconds.
* **Packages needed:** [`perfect-freehand`](https://www.npmjs.com/package/perfect-freehand) (generates pressure-sensitive, smooth SVG polygons from raw coordinate arrays).
* **Pros:** Highly expressive UX; strokes look incredible.
* **Cons:** Highest effort. Requires adding a UI state toggle to enter "pen mode" vs default "interaction mode".
