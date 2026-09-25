import {
  objectLockKey,
  type PlayerId,
  type StackCardPayload,
} from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { rejectForeignLock } from "../player/object-locks.js";
import { getStandaloneCard } from "../card/card-access.js";
import { addCardToStack, createStack, getStack } from "./stack-helpers.js";

function requireOwnedSourceLock(
  state: RoomState,
  playerId: PlayerId,
  cardId: string,
  now: number,
): void {
  const key = objectLockKey({ kind: "card", id: cardId });
  const lock = state.locks.get(key);
  if (!lock || lock.expiresAt <= now || lock.playerId !== playerId) {
    if (lock && lock.expiresAt <= now) state.locks.delete(key);
    throw new DomainCommandError("The source card must be claimed by this player.");
  }
}

export function stackCard(
  state: RoomState,
  playerId: PlayerId,
  payload: StackCardPayload,
  now: number,
  createId?: () => string,
): string {
  const source = getStandaloneCard(state, payload.cardId);
  requireOwnedSourceLock(state, playerId, source.id, now);

  if (payload.target.kind === "card") {
    if (source.id === payload.target.cardId) {
      throw new DomainCommandError("A card cannot be stacked onto itself.");
    }
    const target = getStandaloneCard(state, payload.target.cardId);
    rejectForeignLock(
      state,
      playerId,
      { kind: "card", id: target.id },
      now,
      "The stack target is claimed by another player.",
    );
    if (source.face !== target.face) {
      throw new DomainCommandError("Cards must have matching faces to stack.");
    }
    const stack = createStack(state, target.id, source.id, createId);
    state.locks.delete(objectLockKey({ kind: "card", id: source.id }));
    state.locks.delete(objectLockKey({ kind: "card", id: target.id }));
    return stack.id;
  }

  const stack = getStack(state, payload.target.stackId);
  rejectForeignLock(
    state,
    playerId,
    { kind: "stack", id: stack.id },
    now,
    "The stack target is claimed by another player.",
  );
  const topId = stack.cardIds.at(-1);
  const top = topId === undefined ? undefined : state.cards.get(topId);
  if (!top || top.stackId !== stack.id) {
    throw new DomainCommandError("Stack membership is inconsistent.");
  }
  if (source.face !== top.face) {
    throw new DomainCommandError("Cards must have matching faces to stack.");
  }
  addCardToStack(state, source.id, stack.id);
  state.locks.delete(objectLockKey({ kind: "card", id: source.id }));
  return stack.id;
}
