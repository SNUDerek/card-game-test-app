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
