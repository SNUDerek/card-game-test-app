import type { CardFace } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { getStandaloneCard } from "./card-access.js";

export function flipCard(state: RoomState, cardId: string): CardFace {
  const card = getStandaloneCard(state, cardId);
  card.face = card.face === "front" ? "back" : "front";
  return card.face;
}
