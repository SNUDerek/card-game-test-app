import type { RoomState } from "../../rooms/state/RoomState.js";
import { getAccessibleCard } from "./card-access.js";

export function tapCard(state: RoomState, cardId: string): "tapped" {
  getAccessibleCard(state, cardId).orientation = "tapped";
  return "tapped";
}
