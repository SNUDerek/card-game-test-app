import { describe, expect, it } from "vitest";
import { DeckGenerationError, generateDeck } from "./generate-deck.js";
import { seededRandomInt } from "./seeded-random.js";

const CARDS = [
  { id: "goblin", type: "creature" },
  { id: "troll", type: "creature" },
  { id: "dragon", type: "creature" },
  { id: "fireball", type: "spell" },
  { id: "shield", type: "spell" },
];

function total(entries: { copies: number }[]): number {
  return entries.reduce((sum, entry) => sum + entry.copies, 0);
}

describe("seededRandomInt", () => {
  it("repeats for the same seed and stays in range", () => {
    const a = seededRandomInt("abc");
    const b = seededRandomInt("abc");
    const rolls = Array.from({ length: 50 }, () => a(7));
    expect(Array.from({ length: 50 }, () => b(7))).toEqual(rolls);
    expect(rolls.every((roll) => roll >= 0 && roll < 7 && Number.isInteger(roll))).toBe(true);
  });

  it("differs between seeds", () => {
    const a = seededRandomInt("abc");
    const b = seededRandomInt("abd");
    expect(Array.from({ length: 20 }, () => a(1000))).not.toEqual(
      Array.from({ length: 20 }, () => b(1000)),
    );
  });
});

describe("generateDeck", () => {
  it("builds a deck of exactly the requested size within the copy cap", () => {
    const { entries } = generateDeck(CARDS, { size: 12, maxCopies: 3, seed: "s1" });

    expect(total(entries)).toBe(12);
    expect(entries.every((entry) => entry.copies >= 1 && entry.copies <= 3)).toBe(true);
  });

  it("reproduces the same deck from the same seed", () => {
    const params = { size: 10, maxCopies: 4, seed: "repeat-me" };
    expect(generateDeck(CARDS, params)).toEqual(generateDeck(CARDS, params));
  });

  it("generates and returns a seed when none is given", () => {
    const result = generateDeck(CARDS, { size: 5, maxCopies: 2 }, () => "made-up");

    expect(result.seed).toBe("made-up");
    expect(generateDeck(CARDS, { size: 5, maxCopies: 2, seed: "made-up" })).toEqual(result);
  });

  it("lists entries in input card order", () => {
    const { entries } = generateDeck(CARDS, { size: 10, maxCopies: 2, seed: "order" });
    // size == capacity, so every card appears, at the cap.
    expect(entries).toEqual(CARDS.map((card) => ({ cardId: card.id, copies: 2 })));
  });

  it("only uses cards of the included types", () => {
    const { entries } = generateDeck(CARDS, {
      size: 4,
      maxCopies: 2,
      includeTypes: ["spell"],
      seed: "spells",
    });
    expect(entries).toEqual([
      { cardId: "fireball", copies: 2 },
      { cardId: "shield", copies: 2 },
    ]);
  });

  it("explains an infeasible request", () => {
    expect(() =>
      generateDeck(CARDS, { size: 10, maxCopies: 3, includeTypes: ["creature"] }),
    ).toThrow(new DeckGenerationError("Only 3 creature cards × 3 copies = 9 < 10 requested."));
  });

  it("rejects a filter that matches nothing", () => {
    expect(() =>
      generateDeck(CARDS, { size: 1, maxCopies: 1, includeTypes: ["land"] }),
    ).toThrow("No land cards to build a deck from.");
    expect(() => generateDeck([], { size: 1, maxCopies: 1 })).toThrow(
      "No cards to build a deck from.",
    );
  });

  it("counts a duplicated input card once", () => {
    const { entries } = generateDeck([...CARDS, CARDS[0]!], { size: 10, maxCopies: 2, seed: "x" });
    expect(entries.filter((entry) => entry.cardId === "goblin")).toEqual([
      { cardId: "goblin", copies: 2 },
    ]);
  });
});
