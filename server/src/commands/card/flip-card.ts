import type { CardFace, PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { rejectForeignLock } from "../player/object-locks.js";
import { getAccessibleCard } from "./card-access.js";

export function flipCard(
  state: RoomState,
  playerId: PlayerId,
  cardId: string,
  now: number,
): CardFace {
  const card = getAccessibleCard(state, cardId);
  rejectForeignLock(
    state,
    playerId,
    { kind: "card", id: card.id },
    now,
    "The card is claimed by another player.",
  );
  card.face = card.face === "front" ? "back" : "front";
  return card.face;
}
