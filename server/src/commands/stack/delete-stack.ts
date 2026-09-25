import { objectLockKey, type PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { rejectForeignLock } from "../player/object-locks.js";
import { getStack } from "./stack-helpers.js";

export function deleteStack(
  state: RoomState,
  playerId: PlayerId,
  stackId: string,
  now: number,
): void {
  const stack = getStack(state, stackId);
  const cards = stack.cardIds.map((id) => state.cards.get(id));
  if (cards.some((card) => !card || card.stackId !== stack.id)) {
    throw new DomainCommandError("Stack membership is inconsistent.");
  }

  rejectForeignLock(
    state,
    playerId,
    { kind: "stack", id: stack.id },
    now,
    "The stack is claimed by another player.",
  );
  for (const card of cards) {
    rejectForeignLock(
      state,
      playerId,
      { kind: "card", id: card!.id },
      now,
      "A card in the stack is claimed by another player.",
    );
  }

  for (const card of cards) {
    state.cards.delete(card!.id);
    state.locks.delete(objectLockKey({ kind: "card", id: card!.id }));
  }
  state.stacks.delete(stack.id);
  state.locks.delete(objectLockKey({ kind: "stack", id: stack.id }));
}
