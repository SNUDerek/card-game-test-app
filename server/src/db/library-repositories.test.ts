import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type WorkspaceDatabase } from "./connection.js";
import { CardRepository } from "./cards.js";
import { DeckRepository } from "./decks.js";
import { SetRepository } from "./sets.js";
import { cardContent, seedImage } from "./test-fixtures.js";

let db: WorkspaceDatabase;
let sets: SetRepository;
let cards: CardRepository;
let decks: DeckRepository;
let imageId: string;

beforeEach(() => {
  db = openDatabase(":memory:");
  sets = new SetRepository(db);
  cards = new CardRepository(db);
  decks = new DeckRepository(db);
  imageId = seedImage(db);
});

afterEach(() => db.close());

describe("SetRepository", () => {
  it("creates, lists with counts and lineage, and hides archived sets", () => {
    const parent = sets.create({ name: "Skirmish v1" }, null, 1);
    const child = sets.create({ name: "Skirmish v2", forkedFromSetId: parent.id }, null, 2);
    cards.create(child.id, cardContent(imageId), null);
    const archivedCard = cards.create(child.id, cardContent(imageId, { name: "Old" }), null);
    cards.setArchived(archivedCard.id, true, null);
    decks.create(child.id, { name: "Starter", description: "", entries: [] }, null);

    expect(sets.list().map((set) => [set.name, set.cardCount, set.deckCount, set.forkedFromSetName]))
      .toEqual([
        ["Skirmish v2", 1, 1, "Skirmish v1"],
        ["Skirmish v1", 0, 0, null],
      ]);

    sets.setArchived(parent.id, true);
    expect(sets.list().map((set) => set.name)).toEqual(["Skirmish v2"]);
    expect(sets.list({ includeArchived: true })).toHaveLength(2);
    expect(sets.setArchived(parent.id, false).archived).toBe(false);
  });

  it("updates with the current revision and rejects a stale one", () => {
    const set = sets.create({ name: "A", description: "first" }, null);
    const updated = sets.update(set.id, set.revision, { name: "B" });
    expect(updated).toMatchObject({ name: "B", description: "first", revision: set.revision + 1 });

    expect(() => sets.update(set.id, set.revision, { name: "C" }))
      .toThrow(expect.objectContaining({ code: "stale_revision" }));
    expect(() => sets.update("missing", 1, { name: "C" }))
      .toThrow(expect.objectContaining({ code: "not_found" }));
  });
});

describe("CardRepository", () => {
  it("appends cards in display order and round-trips metadata", () => {
    const set = sets.create({ name: "A" }, null);
    const first = cards.create(set.id, cardContent(imageId, { metadata: { cost: 3 } }), null);
    const second = cards.create(set.id, cardContent(imageId, { name: "Frostbolt" }), null);

    expect([first.position, second.position]).toEqual([0, 1]);
    expect(cards.listBySet(set.id).map((card) => card.name)).toEqual(["Fireball", "Frostbolt"]);
    expect(cards.find(first.id)).toMatchObject({ metadata: { cost: 3 }, archived: false, revision: 1 });
    expect(second.metadata).toBeUndefined();
  });

  it("rejects stale edits and reports which decks still reference a card", () => {
    const set = sets.create({ name: "A" }, null);
    const card = cards.create(set.id, cardContent(imageId), null);
    const edited = cards.update(card.id, card.revision, cardContent(imageId, { body: "Deal 4." }), null);
    expect(edited).toMatchObject({ body: "Deal 4.", revision: 2 });
    expect(() => cards.update(card.id, card.revision, cardContent(imageId), null))
      .toThrow(expect.objectContaining({ code: "stale_revision" }));

    decks.create(set.id, { name: "Burn", description: "", entries: [{ cardId: card.id, copies: 2 }] }, null);
    expect(cards.decksReferencing(card.id)).toEqual(["Burn"]);
  });

  it("refuses an image that was never uploaded", () => {
    const set = sets.create({ name: "A" }, null);
    expect(() => cards.create(set.id, cardContent("f".repeat(64)), null))
      .toThrow(expect.objectContaining({ code: "invalid" }));
  });
});

describe("DeckRepository", () => {
  function setWithCards() {
    const set = sets.create({ name: "A" }, null);
    const a = cards.create(set.id, cardContent(imageId, { name: "A" }), null);
    const b = cards.create(set.id, cardContent(imageId, { name: "B" }), null);
    return { set, a, b };
  }

  it("creates, replaces entries atomically, duplicates, and deletes", () => {
    const { set, a, b } = setWithCards();
    const deck = decks.create(set.id, {
      name: "Starter",
      description: "",
      entries: [{ cardId: b.id, copies: 1 }, { cardId: a.id, copies: 3 }],
    }, null);
    expect(deck.cardCount).toBe(4);
    expect(deck.entries).toEqual([{ cardId: a.id, copies: 3 }, { cardId: b.id, copies: 1 }]);

    const updated = decks.update(deck.id, deck.revision, {
      name: "Starter+", description: "more", entries: [{ cardId: b.id, copies: 5 }],
    }, null);
    expect(updated).toMatchObject({ name: "Starter+", revision: 2, cardCount: 5, entries: [{ cardId: b.id, copies: 5 }] });

    const copy = decks.duplicate(deck.id, "Copy", null);
    expect(copy.id).not.toBe(deck.id);
    expect(copy.entries).toEqual(updated.entries);
    expect(decks.listBySet(set.id).map((d) => d.name)).toEqual(["Copy", "Starter+"]);

    decks.delete(deck.id);
    expect(decks.find(deck.id)).toBeUndefined();
    expect(() => decks.delete(deck.id)).toThrow(expect.objectContaining({ code: "not_found" }));
  });

  it("leaves a deck untouched when a save is stale or has a bad entry", () => {
    const { set, a, b } = setWithCards();
    const deck = decks.create(set.id, { name: "D", description: "", entries: [{ cardId: a.id, copies: 1 }] }, null);
    decks.update(deck.id, deck.revision, { name: "D2", description: "", entries: [{ cardId: b.id, copies: 1 }] }, null);

    expect(() => decks.update(deck.id, deck.revision, { name: "Lost", description: "", entries: [] }, null))
      .toThrow(expect.objectContaining({ code: "stale_revision" }));
    expect(() => decks.update(deck.id, 2, {
      name: "Dup", description: "", entries: [{ cardId: a.id, copies: 1 }, { cardId: a.id, copies: 1 }],
    }, null)).toThrow(expect.objectContaining({ code: "invalid" }));

    expect(decks.require(deck.id)).toMatchObject({ name: "D2", revision: 2, entries: [{ cardId: b.id, copies: 1 }] });
  });

  it("refuses cards from another set and archived cards", () => {
    const { set, a } = setWithCards();
    const other = sets.create({ name: "Other" }, null);
    const foreign = cards.create(other.id, cardContent(imageId), null);
    cards.setArchived(a.id, true, null);

    expect(() => decks.create(set.id, { name: "X", description: "", entries: [{ cardId: foreign.id, copies: 1 }] }, null))
      .toThrow(/not in this deck's set/);
    expect(() => decks.create(set.id, { name: "X", description: "", entries: [{ cardId: a.id, copies: 1 }] }, null))
      .toThrow(/archived/);
    expect(decks.listBySet(set.id)).toEqual([]);
  });
});
