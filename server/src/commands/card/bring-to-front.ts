import type { RoomState } from "../../rooms/state/RoomState.js";
import { getStandaloneCard } from "./card-access.js";

export function bringToFront(state: RoomState, cardId: string): number {
  const card = getStandaloneCard(state, cardId);
  const highestZIndex = [...state.cards.values()].reduce(
    (highest, candidate) => Math.max(highest, candidate.zIndex),
    -1,
  );
  card.zIndex = highestZIndex + 1;
  return card.zIndex;
}

export function bringToFrontIfNeeded(state: RoomState, cardId: string): number {
  const card = getStandaloneCard(state, cardId);
  const highestZIndex = [...state.cards.values()].reduce(
    (highest, candidate) => Math.max(highest, candidate.zIndex),
    card.zIndex,
  );
  return card.zIndex < highestZIndex ? bringToFront(state, cardId) : card.zIndex;
}
