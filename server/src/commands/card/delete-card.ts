import { objectLockKey, type PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { getAccessibleCard } from "./card-access.js";
import { collapseStackIfNeeded } from "../stack/stack-helpers.js";

export function deleteCard(
  state: RoomState,
  playerId: PlayerId,
  cardId: string,
  now: number,
): void {
  const card = getAccessibleCard(state, cardId);

  const lockKey = objectLockKey({ kind: "card", id: cardId });
  const lock = state.locks.get(lockKey);
  if (lock && lock.expiresAt > now && lock.playerId !== playerId) {
    throw new DomainCommandError("The card is claimed by another player.");
  }

  if (card.stackId !== undefined) {
    const stack = state.stacks.get(card.stackId)!;
    stack.cardIds.pop();
    state.cards.delete(cardId);
    collapseStackIfNeeded(state, stack.id);
  } else {
    state.cards.delete(cardId);
  }
  state.locks.delete(lockKey);
}
