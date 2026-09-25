import type { PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";

/**
 * Records which card a player's pointer is over, so other clients can show who
 * is looking at what.
 *
 * This is presence, not ownership: it claims nothing, blocks nothing, and any
 * number of players may hover the same card at once. A player only ever writes
 * their own entry, so there is no lock check to make.
 *
 * Hovering a card that has since been deleted is rejected rather than stored,
 * which keeps the reference in room state from dangling. Clients tolerate a
 * missing card anyway, because a delete and a hover can cross on the wire.
 */
export function setPlayerHover(
  state: RoomState,
  playerId: PlayerId,
  cardId: string | null,
): boolean {
  const player = state.players.get(playerId);
  if (!player) throw new DomainCommandError(`Unknown player: ${playerId}`);

  if (cardId === null) {
    player.hoveredCardId = undefined;
    return false;
  }

  if (!state.cards.has(cardId)) throw new DomainCommandError(`Unknown card: ${cardId}`);
  player.hoveredCardId = cardId;
  return true;
}

/** Drops a player's hover, so a departed pointer does not linger on a card. */
export function clearPlayerHover(state: RoomState, playerId: PlayerId): void {
  const player = state.players.get(playerId);
  if (player) player.hoveredCardId = undefined;
}

/**
 * Clears every player's hover of a card that is going away. Without this a
 * deleted card would leave stale pointers behind in player presence.
 */
export function clearHoversOfCard(state: RoomState, cardId: string): void {
  for (const player of state.players.values()) {
    if (player.hoveredCardId === cardId) player.hoveredCardId = undefined;
  }
}
