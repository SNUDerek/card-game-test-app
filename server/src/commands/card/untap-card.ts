import type { RoomState } from "../../rooms/state/RoomState.js";
import { getAccessibleCard } from "./card-access.js";

export function untapCard(state: RoomState, cardId: string): "upright" {
  getAccessibleCard(state, cardId).orientation = "upright";
  return "upright";
}
