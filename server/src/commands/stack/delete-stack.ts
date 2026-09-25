import { objectLockKey } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { getStack } from "./stack-helpers.js";

export function deleteStack(state: RoomState, stackId: string): void {
  const stack = getStack(state, stackId);
  const cards = stack.cardIds.map((id) => state.cards.get(id));
  if (cards.some((card) => !card || card.stackId !== stack.id)) {
    throw new DomainCommandError("Stack membership is inconsistent.");
  }
  for (const card of cards) {
    state.cards.delete(card!.id);
    state.locks.delete(objectLockKey({ kind: "card", id: card!.id }));
  }
  state.stacks.delete(stack.id);
  state.locks.delete(objectLockKey({ kind: "stack", id: stack.id }));
}
