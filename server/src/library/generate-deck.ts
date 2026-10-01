import type {
  CardDefinition,
  DeckEntry,
  DeckGenerationParams,
  GeneratedDeck,
} from "@card-table/shared";
import { createSeed, seededRandomInt } from "./seeded-random.js";

/** A generation request the given cards cannot satisfy. */
export class DeckGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckGenerationError";
  }
}

type GeneratorCard = Pick<CardDefinition, "id" | "type">;

function describeEligible(count: number, includeTypes: readonly string[] | undefined): string {
  const noun = count === 1 ? "card" : "cards";
  return includeTypes ? `${count} ${includeTypes.join("/")} ${noun}` : `${count} ${noun}`;
}

/**
 * Builds a random deck from a set's cards.
 *
 * Each pick is uniform over the cards still under `maxCopies`. The result is
 * reproducible: the same seed, the same cards in the same order, and the same
 * params always give the same entries. Callers pass cards in a stable order
 * (the set's display order) for that to hold across requests.
 *
 * Entries come back in input card order, with zero-copy cards omitted.
 */
export function generateDeck(
  cards: readonly GeneratorCard[],
  params: DeckGenerationParams,
  makeSeed: () => string = createSeed,
): GeneratedDeck {
  const types = params.includeTypes ? new Set(params.includeTypes) : undefined;
  const eligible = [...new Map(cards.map((card) => [card.id, card])).values()].filter(
    (card) => !types || types.has(card.type),
  );

  if (eligible.length === 0) {
    throw new DeckGenerationError(
      params.includeTypes
        ? `No ${params.includeTypes.join("/")} cards to build a deck from.`
        : "No cards to build a deck from.",
    );
  }
  const capacity = eligible.length * params.maxCopies;
  if (params.size > capacity) {
    throw new DeckGenerationError(
      `Only ${describeEligible(eligible.length, params.includeTypes)} × ` +
        `${params.maxCopies} ${params.maxCopies === 1 ? "copy" : "copies"} = ${capacity} ` +
        `< ${params.size} requested.`,
    );
  }

  const seed = params.seed ?? makeSeed();
  const randomInt = seededRandomInt(seed);
  const copies = new Map<string, number>();
  // Indices into `eligible` still under the cap. Swap-removal reorders them,
  // but deterministically, so the seed still reproduces the result.
  const open = eligible.map((_, index) => index);

  for (let picked = 0; picked < params.size; picked++) {
    const slot = randomInt(open.length);
    const card = eligible[open[slot]!]!;
    const count = (copies.get(card.id) ?? 0) + 1;
    copies.set(card.id, count);
    if (count >= params.maxCopies) {
      open[slot] = open[open.length - 1]!;
      open.pop();
    }
  }

  const entries: DeckEntry[] = eligible.flatMap((card) => {
    const count = copies.get(card.id);
    return count ? [{ cardId: card.id, copies: count }] : [];
  });
  return { entries, seed };
}
