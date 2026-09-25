import type { PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { rejectForeignLock } from "../player/object-locks.js";
import { getStack } from "./stack-helpers.js";

/** Returns a uniformly random integer in [0, exclusiveMax). */
export type RandomInt = (exclusiveMax: number) => number;

const defaultRandomInt: RandomInt = (exclusiveMax) =>
  Math.floor(Math.random() * exclusiveMax);

/**
 * Randomizes a stack's card order.
 *
 * Only `cardIds` changes: face and orientation travel with the card, so a stack
 * holding a mix of face-up and face-down cards keeps that mix — the cards just
 * end up in a different order. The stack's size cannot change, so no collapse
 * check is needed.
 *
 * The permutation is chosen here rather than supplied by the caller, so no
 * client can predict or dictate the resulting order.
 */
export function shuffleStack(
  state: RoomState,
  playerId: PlayerId,
  stackId: string,
  now: number,
  randomInt: RandomInt = defaultRandomInt,
): void {
  const stack = getStack(state, stackId);
  rejectForeignLock(
    state,
    playerId,
    { kind: "stack", id: stack.id },
    now,
    "The stack is claimed by another player.",
  );

  if (stack.cardIds.length < 2) {
    throw new DomainCommandError("Stack membership is inconsistent.");
  }
  for (const memberId of stack.cardIds) {
    const member = state.cards.get(memberId);
    if (!member || member.stackId !== stack.id) {
      throw new DomainCommandError("Stack membership is inconsistent.");
    }
    // A card another player is holding must not be moved out from under them.
    rejectForeignLock(
      state,
      playerId,
      { kind: "card", id: memberId },
      now,
      "A card in the stack is claimed by another player.",
    );
  }

  // Fisher-Yates over a plain copy: the schema array is only written once the
  // permutation is known, so a rejection above leaves the stack untouched.
  const shuffled = [...stack.cardIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  for (const [index, cardId] of shuffled.entries()) stack.cardIds[index] = cardId;
}
