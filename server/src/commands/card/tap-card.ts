import type { CardOrientation, PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { rejectForeignLock } from "../player/object-locks.js";
import { getAccessibleCard } from "./card-access.js";

/**
 * Tapping and untapping differ only in the orientation they write, so they
 * share one guarded implementation.
 */
export function setCardOrientation(
  state: RoomState,
  playerId: PlayerId,
  cardId: string,
  now: number,
  orientation: CardOrientation,
): CardOrientation {
  const card = getAccessibleCard(state, cardId);
  rejectForeignLock(
    state,
    playerId,
    { kind: "card", id: card.id },
    now,
    "The card is claimed by another player.",
  );
  card.orientation = orientation;
  return orientation;
}
