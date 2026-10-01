# Workspace Feedback Plan

Four requests from local testing after the persistent-workspace work (PR #32).
Each section covers the current behavior, the change, the files involved, and tests.
They are independent and can ship in any order. The suggested order is at the end.

---

## 1. Show rules text on the set screen's card tiles

**Current behavior.** Each tile in the card list shows only the artwork, name, and
type, built in `client/src/features/sets/cards/CardList.tsx`. The editor dialog
(`CardEditor.tsx`) does load and edit `body`, and the search box already matches
it, so the text exists but the grid never displays it. This is a missing display,
not lost data.

**Change.**

- In `CardList.tsx`, add `card.body` under the type in each tile, for example
  `<p className="card-tile-body">{card.body}</p>`. Skip it when the body is empty.
- In `client/src/features/sets/workspace.css`, clamp it to about 3 lines
  (`display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden;`) with a smaller, muted font so the grid stays even.
- Set `title={card.body}` on the tile so the full text shows on hover.

**Not recommended:** rendering every tile with the Konva `CardRenderer`. One Konva
stage per tile is heavy for large sets. The editor already shows the true card
preview.

**Tests.** Extend the `CardList` component test: a card's body text appears in its
tile, and an empty body leaves no empty element.

---

## 2. Make "Manage card sets" a prominent button outside the room panel

**Current behavior.** `client/src/features/lobby/Lobby.tsx` places
`<Link href="/sets">Manage card sets</Link>` inside the "Card Table" form, which
is about creating and joining rooms. It inherits the browser's default link color,
which is blue on a dark navy card.

**Change.** Treat the library as its own area in the lobby.

- Move the link out of `.lobby-card` into a small panel or header of its own. Two
  options:
  - **A (recommended):** a lobby header bar across the top of `<main className="lobby">`
    containing the signed-in name, a **Card sets** button, and **Sign out**. These
    are account and workspace actions, so this also moves "Signed in as" and
    "Sign out" out of the room form.
  - **B:** a third panel beside the "Card Table" form and `RoomBrowser`, titled
    "Card library", with a short line ("Create and edit sets, cards, and decks")
    and an **Open card sets** button.
- Style it as a real button with the same visual weight as `.lobby-modes button`.
  wouter's `<Link>` renders an `<a>`, so keep it a link for semantics and give it a
  `.lobby-button` class instead of nesting a `<button>`.
- If the set list is empty (`sets.length === 0`), the create-room `<select>` shows
  "No sets available". Add a hint there that links to the set screen too.

**Files.** `Lobby.tsx`, `Lobby.css`, and the lobby test, which may query the link
by text.

**Tests.** The lobby renders a "Card sets" link pointing to `/sets` outside the
room form. The empty-set hint appears when `/api/sets` returns no sets.

---

## 3. Seed a "Sample Set" from `cards/`

**Current behavior.** A fresh database has no sets. The README tells you to run
`npm run cards:import -w server -- ./cards "Skirmish v1"` by hand. The importer
(`server/src/library/import-cards.ts` → `importCardSet()`) and the folder loader
(`loadCardSources()` in `server/src/cards/load-card-catalog.ts`) already do all
of the work.

**Change.** Run that import automatically, once, when the workspace is empty.

- New module `server/src/library/seed-sample-set.ts`:

  ```ts
  export async function seedSampleSetIfEmpty(
    db: WorkspaceDatabase, imageStore: ImageStore, cardsDir: string | undefined,
  ): Promise<{ seeded: boolean; reason?: string }>
  ```

  - Return without seeding when `cardsDir` is unset or does not exist.
  - Return without seeding when **any** set exists, archived ones included. Use
    `new SetRepository(db).list({ includeArchived: true }).length > 0`, or add a
    cheap `count()` to `SetRepository`. Counting archived sets means archiving or
    forking the sample never brings it back on the next restart.
  - Otherwise call `loadCardSources(cardsDir)` and
    `importCardSet(db, imageStore, sources, "Sample Set")` with `userId = null`.
  - If a `CardCatalogError` is thrown (a bad sample file), log it and continue.
    The server must still start.
- Config in `server/src/config/env.ts`:
  `SAMPLE_CARDS_DIR = process.env.SAMPLE_CARDS_DIR ?? path.join(import.meta.dirname, "../../../cards")`,
  following the same pattern as `DATA_DIR`. Set `SAMPLE_CARDS_DIR=` (empty) to
  disable seeding.
- Call it in `server/src/index.ts` after `openDatabase` and the `ImageStore` are
  created, and before `server.listen`. Top-level `await` is fine because the
  module is ESM.
- **Docker.** The server image does not contain `cards/`, but
  `docker-compose.yml` already mounts `./cards:/app/cards:ro`. Add
  `SAMPLE_CARDS_DIR: /app/cards` to the server's `environment`. If the default
  path is resolved from `dist/`, it also lands on `/app/cards`. Check that once
  and set the variable explicitly either way.
- Docs: in `README.md`, mention that a fresh workspace starts with "Sample Set"
  and that the manual import is now only needed for additional sets. Add
  `SAMPLE_CARDS_DIR` to the env table and to `.env.example`.

**Edge cases.**

- If two server processes start against one database, both could see it empty.
  This app runs a single process, so accept the risk. Run the empty check and the
  insert inside one transaction if it is cheap to do.
- Sample cards are `.png` files. `loadCardSources` already accepts `.png` and `.jpg`.

**Tests.** In `seed-sample-set.test.ts`, use the existing test DB and a temp
images dir:

- an empty DB seeds one set named "Sample Set" with N cards;
- a second call does nothing;
- a DB that has only an archived set does nothing;
- a missing directory does nothing;
- an invalid card file is logged, and nothing is seeded or thrown.

---

## 4. Edit a card from the table's right-click menu

**Current behavior.** The right-click menu (`client/src/tabletop/TableContextMenu.tsx`)
offers Tap/Untap, Magnify, Draw, Shuffle, and Delete. Editing a card definition
already updates live rooms. `CardLibrary` emits `changed`, `TableRoom.onLibraryChanged`
broadcasts `CATALOG_CHANGED`, and `CardCatalogProvider` refetches and shows
"Alice edited Goblin". So this is **UI only**: no new room command and no server
change.

This fits the state model. A card definition is library data edited over HTTP,
not room state, so it must **not** become a Colyseus command. The editor dialog
itself is local UI state.

**Change.**

1. **Make `CardEditor` usable outside the set screen.**
   - It is already a self-contained modal (`.editor-backdrop`). Its styles, though,
     live in `features/sets/workspace.css`, which only the set screens import.
     Either import that stylesheet from `CardEditor.tsx` itself, or move the
     editor rules (`.editor-backdrop`, `.card-editor`, `.editor-layout`, …) into
     a `CardEditor.css` that the component imports. The second option is cleaner.
   - Check the z-index against the tabletop overlays (HUD, magnify preview, card
     browser). The backdrop is `z-index: 2000`.
   - Its props (`setId`, `card`, `onClose`, `onSaved`) already fit. On the table,
     `onSaved` just closes the dialog, because the catalog refetch arrives through
     the `CATALOG_CHANGED` broadcast.
2. **Add the menu item.** In `TableContextMenu.tsx`, add an `onEdit(cardId)` prop
   alongside `onMagnify`, documented as local-only in the same way, and an
   "Edit card…" item after Magnify.
3. **Wire it in `client/src/tabletop/Table.tsx`.**
   - Add local state `const [editingDefinitionId, setEditingDefinitionId] = useState<string | null>(null)`.
   - Resolve the menu card's `definitionId` through `useCardCatalog().definitionsById`.
   - Render `<CardEditor setId={definition.setId} card={definition} … />` while it is set.
   - Read the definition from the live catalog when rendering, not a copy saved
     when the menu opened. If someone else edits the card while the dialog is
     open, the editor's revision check (`ApiConflictError`) reports the conflict
     and keeps the draft, which is the existing behavior.
4. **Pointer and keyboard isolation.** The dialog sits above the Konva stage.
   Make sure pointer events on the backdrop don't reach the stage and start
   pans or drags. Also make sure table keyboard shortcuts, if any are added later,
   don't fire while typing in the dialog.

**Behavior to decide.**

- **Face-down cards.** Opening the editor on a face-down card reveals its face to
  the person editing. The recommendation is to hide "Edit card…" when
  `card.face === "back"`, matching how the table hides face-down information.
  The alternative is to allow it, since this is a prototyping tool.
- **Scope of an edit.** Editing changes the definition, so **every copy** of the
  card in every room using this set changes, plus future decks. Say so in the
  dialog, for example a line under the header: "Changes apply to every copy of
  this card in the set." No per-instance overrides; that would be a new feature.
- **Archived definitions.** If the card's definition was archived after it was
  dealt, editing should still work or fail clearly with the server's existing
  error. Confirm which, and hide the item if the API refuses.

**Tests.**

- `TableContextMenu.test.tsx`: "Edit card…" calls `onEdit` with the card id and
  closes the menu. If face-down cards hide it, it is absent for them.
- `Table` test or new small test: choosing Edit opens the `CardEditor` dialog for
  the card's definition. Closing it removes the dialog.
- Existing `CardEditor` tests should pass unchanged after the CSS move.

---

## Suggested order

1. **#1 tile text** and **#2 lobby button**: small client-only changes, one PR.
2. **#3 sample set**: server and docs, its own PR.
3. **#4 edit from table**: client-only but touches tabletop interaction, its own PR.

## Open questions

- #2: header bar (A) or separate library panel (B)?
- #4: hide "Edit card…" on face-down cards, or allow it?
- #3: is "Sample Set" the right name, or something matching the cards (for
  example "Fantasy Sample")?
