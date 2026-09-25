import type { RoomState } from "../../rooms/state/RoomState.js";
import { getStandaloneCard } from "./card-access.js";

export function untapCard(state: RoomState, cardId: string): "upright" {
  getStandaloneCard(state, cardId).orientation = "upright";
  return "upright";
}
