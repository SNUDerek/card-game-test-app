import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type WorkspaceDatabase } from "../db/connection.js";
import { CardRepository } from "../db/cards.js";
import { DeckRepository } from "../db/decks.js";
import { SetRepository } from "../db/sets.js";
import { cardContent, seedImage, seedUser } from "../db/test-fixtures.js";
import { CardLibrary, type LibraryChange } from "./card-library.js";

let db: WorkspaceDatabase;
let library: CardLibrary;
let sets: SetRepository;
let imageId: string;
let changes: LibraryChange[];

beforeEach(() => {
  db = openDatabase(":memory:");
  library = new CardLibrary(db);
  sets = new SetRepository(db);
  imageId = seedImage(db);
  changes = [];
  library.on("changed", (change) => changes.push(change));
});

afterEach(() => db.close());

describe("CardLibrary", () => {
  it("loads sets created behind its back on first use", () => {
    const set = sets.create({ name: "Imported" }, null);
    const card = new CardRepository(db).create(set.id, cardContent(imageId), null);

    expect(library.cardsInSet(set.id).map((c) => c.id)).toEqual([card.id]);
    expect(library.getCard(card.id)?.setId).toBe(set.id);
    expect(library.hasActiveCard(set.id, card.id)).toBe(true);
    expect(library.hasActiveCard("other-set", card.id)).toBe(false);
  });

  it("writes through to the database and emits a change per write", () => {
    seedUser(db, "user-1");
    seedUser(db, "user-2");
    const set = sets.create({ name: "A" }, null);
    const lookup = library.activeCardIds(set.id);
    library.cardsInSet(set.id);

    const card = library.createCard(set.id, cardContent(imageId), "user-1");
    expect(lookup.has(card.id)).toBe(true);

    const edited = library.updateCard(card.id, card.revision, cardContent(imageId, { body: "Deal 4." }), "user-2");
    expect(library.getCard(card.id)?.body).toBe("Deal 4.");
    expect(new CardRepository(db).require(card.id).body).toBe("Deal 4.");

    library.archiveCard(card.id, null);
    expect(lookup.has(card.id)).toBe(false);
    expect(library.cardsInSet(set.id)).toEqual([]);
    expect(library.cardsInSet(set.id, { includeArchived: true })).toHaveLength(1);

    library.restoreCard(card.id, null);
    expect(lookup.has(card.id)).toBe(true);

    library.updateSet(set.id, set.revision, { name: "A2" }, "user-1");

    expect(changes).toEqual([
      { setId: set.id, cardIds: [card.id], userId: "user-1" },
      { setId: set.id, cardIds: [card.id], userId: "user-2" },
      { setId: set.id, cardIds: [card.id], userId: null },
      { setId: set.id, cardIds: [card.id], userId: null },
      { setId: set.id, cardIds: [], userId: "user-1" },
    ]);
    expect(edited.revision).toBe(2);
  });

  it("keeps the cache unchanged and emits nothing when a write fails", () => {
    const set = sets.create({ name: "A" }, null);
    const card = library.createCard(set.id, cardContent(imageId), null);
    library.updateCard(card.id, card.revision, cardContent(imageId, { body: "New" }), null);
    changes = [];

    expect(() => library.updateCard(card.id, card.revision, cardContent(imageId, { body: "Stale" }), null))
      .toThrow(expect.objectContaining({ code: "stale_revision" }));
    expect(library.getCard(card.id)?.body).toBe("New");
    expect(changes).toEqual([]);
  });

  it("refuses to archive a card a saved deck still lists", () => {
    const set = sets.create({ name: "A" }, null);
    const card = library.createCard(set.id, cardContent(imageId), null);
    new DeckRepository(db).create(set.id, { name: "Burn", description: "", entries: [{ cardId: card.id, copies: 1 }] }, null);

    expect(() => library.archiveCard(card.id, null)).toThrow(/deck "Burn"/);
    expect(library.hasActiveCard(set.id, card.id)).toBe(true);
  });

  it("refuses new cards in an archived set", () => {
    const set = sets.create({ name: "A" }, null);
    sets.setArchived(set.id, true);
    expect(() => library.createCard(set.id, cardContent(imageId), null))
      .toThrow(expect.objectContaining({ code: "conflict" }));
  });
});
