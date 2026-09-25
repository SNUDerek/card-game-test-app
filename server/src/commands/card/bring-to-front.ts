import type { RoomState } from "../../rooms/state/RoomState.js";
import { highestTableZIndex } from "../stack/stack-helpers.js";
import { getStandaloneCard } from "./card-access.js";

export function bringToFront(state: RoomState, cardId: string): number {
  const card = getStandaloneCard(state, cardId);
  card.zIndex = highestTableZIndex(state) + 1;
  return card.zIndex;
}

export function bringToFrontIfNeeded(state: RoomState, cardId: string): number {
  const card = getStandaloneCard(state, cardId);
  return card.zIndex < highestTableZIndex(state) ? bringToFront(state, cardId) : card.zIndex;
}
