import type { RoomState } from "../../rooms/state/RoomState.js";
import { getStandaloneCard } from "./card-access.js";

export function bringToFront(state: RoomState, cardId: string): number {
  const card = getStandaloneCard(state, cardId);
  const highestZIndex = [...state.cards.values()].reduce(
    (highest, candidate) => Math.max(highest, candidate.zIndex),
    -1,
  );
  const highestStackZIndex = [...state.stacks.values()].reduce(
    (highest, stack) => Math.max(highest, stack.zIndex),
    -1,
  );
  card.zIndex = Math.max(highestZIndex, highestStackZIndex) + 1;
  return card.zIndex;
}

export function bringToFrontIfNeeded(state: RoomState, cardId: string): number {
  const card = getStandaloneCard(state, cardId);
  const highestZIndex = [...state.cards.values()].reduce(
    (highest, candidate) => Math.max(highest, candidate.zIndex),
    card.zIndex,
  );
  const highestStackZIndex = [...state.stacks.values()].reduce(
    (highest, stack) => Math.max(highest, stack.zIndex),
    -1,
  );
  return card.zIndex < Math.max(highestZIndex, highestStackZIndex)
    ? bringToFront(state, cardId)
    : card.zIndex;
}
