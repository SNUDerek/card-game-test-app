import type { RoomState } from "../../rooms/state/RoomState.js";
import { getStandaloneCard } from "./card-access.js";

export function deleteCard(state: RoomState, cardId: string): void {
  getStandaloneCard(state, cardId);
  state.cards.delete(cardId);
  state.locks.delete(`card:${cardId}`);
}
