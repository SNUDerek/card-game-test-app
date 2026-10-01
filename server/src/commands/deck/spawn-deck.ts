import { randomUUID } from "node:crypto";
import type { CardDefinitionId, DeckEntry, SpawnDeckPayload, SpawnDeckResult } from "@card-table/shared";
import { CardInstanceState, CardStackState, type RoomState } from "../../rooms/state/RoomState.js";
import { MAX_CARDS_PER_ROOM, type CardDefinitionLookup } from "../card/spawn-card.js";
import { DomainCommandError } from "../errors.js";
import { defaultRandomInt, shuffled, type RandomInt } from "../random.js";
import { highestTableZIndex } from "../stack/stack-helpers.js";
import { assertWorldPosition } from "../world-position.js";

export interface SpawnDeckOptions {
  createId?: () => string;
  randomInt?: RandomInt;
}

/** Expands `{cardId, copies}` entries into one definition id per physical card. */
export function expandDeckEntries(entries: readonly DeckEntry[]): CardDefinitionId[] {
  return entries.flatMap((entry) => Array.from({ length: entry.copies }, () => entry.cardId));
}

/**
 * Deals a deck onto the table as a single stack, in one atomic mutation.
 *
 * Everything is validated before anything is written, so a rejected deal leaves
 * the table exactly as it was. Entry order is bottom to top unless shuffled. A
 * one-card deck becomes a standalone card, since a stack needs at least two.
 */
export function spawnDeck(
  state: RoomState,
  definitionIds: CardDefinitionLookup,
  payload: SpawnDeckPayload,
  { createId = randomUUID, randomInt = defaultRandomInt }: SpawnDeckOptions = {},
): SpawnDeckResult {
  const unknown = payload.entries.find((entry) => !definitionIds.has(entry.cardId));
  if (unknown) throw new DomainCommandError(`Unknown card definition: ${unknown.cardId}`);
  assertWorldPosition(payload);

  const expanded = expandDeckEntries(payload.entries);
  const free = MAX_CARDS_PER_ROOM - state.cards.size;
  if (expanded.length > free) {
    throw new DomainCommandError(
      `A table holds at most ${MAX_CARDS_PER_ROOM} cards; this deck has ${expanded.length} ` +
        `and only ${free} more fit.`,
    );
  }

  const order = payload.shuffle ? shuffled(expanded, randomInt) : expanded;
  const zIndex = highestTableZIndex(state) + 1;
  const cards = order.map(
    (definitionId) =>
      new CardInstanceState({
        id: createId(),
        definitionId,
        face: payload.face,
        orientation: "upright",
        x: payload.x,
        y: payload.y,
        zIndex,
      }),
  );

  if (cards.length === 1) {
    const card = cards[0]!;
    state.cards.set(card.id, card);
    return { kind: "card", cardId: card.id };
  }

  const stack = new CardStackState({
    id: createId(),
    x: payload.x,
    y: payload.y,
    cardIds: cards.map((card) => card.id),
    zIndex,
  });
  for (const card of cards) {
    card.stackId = stack.id;
    state.cards.set(card.id, card);
  }
  state.stacks.set(stack.id, stack);
  return { kind: "stack", stackId: stack.id, cardCount: cards.length };
}
