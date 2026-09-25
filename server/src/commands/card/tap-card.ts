import type { RoomState } from "../../rooms/state/RoomState.js";
import { getStandaloneCard } from "./card-access.js";

export function tapCard(state: RoomState, cardId: string): "tapped" {
  getStandaloneCard(state, cardId).orientation = "tapped";
  return "tapped";
}
