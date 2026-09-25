import type { PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { rejectForeignLock } from "../player/object-locks.js";
import { highestTableZIndex } from "../stack/stack-helpers.js";
import { getStandaloneCard } from "./card-access.js";

export function bringToFront(
  state: RoomState,
  playerId: PlayerId,
  cardId: string,
  now: number,
): number {
  const card = getStandaloneCard(state, cardId);
  rejectForeignLock(
    state,
    playerId,
    { kind: "card", id: card.id },
    now,
    "The card is claimed by another player.",
  );
  return raiseToFront(state, cardId);
}

/** Unguarded lift used by commands that have already authorized the caller. */
export function raiseToFront(state: RoomState, cardId: string): number {
  const card = getStandaloneCard(state, cardId);
  card.zIndex = highestTableZIndex(state) + 1;
  return card.zIndex;
}

export function bringToFrontIfNeeded(state: RoomState, cardId: string): number {
  const card = getStandaloneCard(state, cardId);
  return card.zIndex < highestTableZIndex(state) ? raiseToFront(state, cardId) : card.zIndex;
}
