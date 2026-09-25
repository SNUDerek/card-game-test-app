import type { PlayerId } from "@card-table/shared";
import type { RoomState } from "./state/RoomState.js";

/**
 * Host selection is deterministic: the connected player who joined earliest.
 * Returns an empty id when the room has no connected player to promote.
 */
export function nextHostPlayerId(state: RoomState): PlayerId {
  let candidate: { id: PlayerId; joinOrder: number } | undefined;
  for (const player of state.players.values()) {
    if (!player.connected) continue;
    if (!candidate || player.joinOrder < candidate.joinOrder) {
      candidate = { id: player.id, joinOrder: player.joinOrder };
    }
  }
  return candidate?.id ?? "";
}

/** The room creator becomes host; later joiners do not displace them. */
export function assignHostIfVacant(state: RoomState, playerId: PlayerId): void {
  if (state.hostPlayerId === "") state.hostPlayerId = playerId;
}
