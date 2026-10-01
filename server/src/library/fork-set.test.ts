import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type WorkspaceDatabase } from "../db/connection.js";
import { CardRepository } from "../db/cards.js";
import { DeckRepository } from "../db/decks.js";
import { SetRepository } from "../db/sets.js";
import { cardContent, seedImage } from "../db/test-fixtures.js";
import { forkSet } from "./fork-set.js";

let db: WorkspaceDatabase;
let sets: SetRepository;
let cards: CardRepository;
let decks: DeckRepository;

beforeEach(() => {
  db = openDatabase(":memory:");
  sets = new SetRepository(db);
  cards = new CardRepository(db);
  decks = new DeckRepository(db);
});

afterEach(() => db.close());

function tableCount(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe("forkSet", () => {
  it("copies active cards and decks into an independent set", () => {
    const imageId = seedImage(db);
    const source = sets.create({ name: "Skirmish v1", description: "Base rules" }, null);
    const fireball = cards.create(source.id, cardContent(imageId, { metadata: { cost: 3 } }), null);
    const archived = cards.create(source.id, cardContent(imageId, { name: "Cut" }), null);
    const frost = cards.create(source.id, cardContent(imageId, { name: "Frostbolt" }), null);
    cards.setArchived(archived.id, true, null);
    decks.create(source.id, {
      name: "Starter",
      description: "Two of each",
      entries: [{ cardId: fireball.id, copies: 2 }, { cardId: frost.id, copies: 1 }],
    }, null);

    const fork = forkSet(db, source.id, "Skirmish v2", null);

    expect(fork).toMatchObject({ name: "Skirmish v2", description: "Base rules", forkedFromSetId: source.id });
    const forkCards = cards.listBySet(fork.id);
    expect(forkCards.map((card) => [card.name, card.imageId, card.position, card.metadata])).toEqual([
      ["Fireball", imageId, 0, { cost: 3 }],
      ["Frostbolt", imageId, 2, undefined],
    ]);
    expect(forkCards.map((card) => card.id)).not.toContain(fireball.id);

    const [deck] = decks.listBySet(fork.id).map((summary) => decks.require(summary.id));
    expect(deck).toMatchObject({ name: "Starter", description: "Two of each", setId: fork.id });
    expect(deck!.entries).toEqual([
      { cardId: forkCards[0]!.id, copies: 2 },
      { cardId: forkCards[1]!.id, copies: 1 },
    ]);

    cards.update(forkCards[0]!.id, 1, cardContent(imageId, { body: "Changed" }), null);
    expect(cards.require(fireball.id).body).toBe("Deal 3 damage.");
  });

  it("rolls back completely when any part of the copy fails", () => {
    const imageId = seedImage(db);
    const source = sets.create({ name: "A" }, null);
    const card = cards.create(source.id, cardContent(imageId), null);
    decks.create(source.id, { name: "D", description: "", entries: [{ cardId: card.id, copies: 1 }] }, null);
    // Bypass the deck guard to reach a state the copy cannot remap.
    db.prepare("UPDATE cards SET archived_at = 1 WHERE id = ?").run(card.id);
    const before = ["card_sets", "cards", "decks", "deck_cards"].map(tableCount);

    expect(() => forkSet(db, source.id, "B", null)).toThrow(/archived card/);
    expect(["card_sets", "cards", "decks", "deck_cards"].map(tableCount)).toEqual(before);
  });

  it("reports a missing source set", () => {
    expect(() => forkSet(db, "missing", "B", null)).toThrow(expect.objectContaining({ code: "not_found" }));
  });
});
