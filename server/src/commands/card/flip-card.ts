import type { CardFace } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { getAccessibleCard } from "./card-access.js";

export function flipCard(state: RoomState, cardId: string): CardFace {
  const card = getAccessibleCard(state, cardId);
  card.face = card.face === "front" ? "back" : "front";
  return card.face;
}
