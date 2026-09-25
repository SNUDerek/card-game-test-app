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
 * Naming a card that no longer exists is not an error. A hover and a delete
 * cross on the wire routinely -- the pointer reaches a card in the instant
 * someone else removes it -- and the honest answer is that the player is now
 * hovering nothing. Storing the id anyway would leave a dangling reference in
 * room state, so the hover is cleared instead.
 */
export function setPlayerHover(
  state: RoomState,
  playerId: PlayerId,
  cardId: string | null,
): boolean {
  const player = state.players.get(playerId);
  if (!player) throw new DomainCommandError(`Unknown player: ${playerId}`);

  const hovering = cardId !== null && state.cards.has(cardId);
  player.hoveredCardId = hovering ? cardId : undefined;
  return hovering;
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
