import type { CardInstanceState, RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";

export function getStandaloneCard(state: RoomState, cardId: string): CardInstanceState {
  const card = state.cards.get(cardId);
  if (!card) throw new DomainCommandError(`Unknown card: ${cardId}`);
  if (card.stackId !== undefined) {
    throw new DomainCommandError("Cards in a stack cannot be manipulated independently.");
  }
  return card;
}

export function getAccessibleCard(state: RoomState, cardId: string): CardInstanceState {
  const card = state.cards.get(cardId);
  if (!card) throw new DomainCommandError(`Unknown card: ${cardId}`);
  if (card.stackId === undefined) return card;
  const stack = state.stacks.get(card.stackId);
  if (!stack || stack.cardIds.at(-1) !== card.id) {
    throw new DomainCommandError("Only the top card of a stack can be manipulated.");
  }
  return card;
}
