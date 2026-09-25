import { objectLockKey, type PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { getStandaloneCard } from "./card-access.js";

export function deleteCard(
  state: RoomState,
  playerId: PlayerId,
  cardId: string,
  now: number,
): void {
  getStandaloneCard(state, cardId);

  const lockKey = objectLockKey({ kind: "card", id: cardId });
  const lock = state.locks.get(lockKey);
  if (lock && lock.expiresAt > now && lock.playerId !== playerId) {
    throw new DomainCommandError("The card is claimed by another player.");
  }

  state.cards.delete(cardId);
  state.locks.delete(lockKey);
}
