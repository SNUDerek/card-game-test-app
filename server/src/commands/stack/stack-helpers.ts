import { randomUUID } from "node:crypto";
import { CardStackState, type RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { getStandaloneCard } from "../card/card-access.js";

export function getStack(state: RoomState, stackId: string): CardStackState {
  const stack = state.stacks.get(stackId);
  if (!stack) throw new DomainCommandError(`Unknown stack: ${stackId}`);
  return stack;
}

export function highestTableZIndex(state: RoomState): number {
  let highest = -1;
  for (const card of state.cards.values()) {
    if (card.stackId === undefined) highest = Math.max(highest, card.zIndex);
  }
  for (const stack of state.stacks.values()) highest = Math.max(highest, stack.zIndex);
  return highest;
}

export function createStack(
  state: RoomState,
  bottomCardId: string,
  topCardId: string,
  createId: () => string = randomUUID,
): CardStackState {
  if (bottomCardId === topCardId) {
    throw new DomainCommandError("A card cannot be stacked onto itself.");
  }
  const bottom = getStandaloneCard(state, bottomCardId);
  const top = getStandaloneCard(state, topCardId);
  const stackId = createId();
  if (state.stacks.has(stackId)) throw new DomainCommandError(`Duplicate stack: ${stackId}`);

  const stack = new CardStackState({
    id: stackId,
    x: bottom.x,
    y: bottom.y,
    cardIds: [bottom.id, top.id],
    zIndex: highestTableZIndex(state) + 1,
  });
  bottom.stackId = stack.id;
  top.stackId = stack.id;
  state.stacks.set(stack.id, stack);
  return stack;
}

export function addCardToStack(
  state: RoomState,
  cardId: string,
  stackId: string,
): CardStackState {
  const card = getStandaloneCard(state, cardId);
  const stack = getStack(state, stackId);
  if (stack.cardIds.length < 2) {
    throw new DomainCommandError("Cannot add a card to an invalid stack.");
  }
  for (const memberId of stack.cardIds) {
    const member = state.cards.get(memberId);
    if (!member || member.stackId !== stack.id) {
      throw new DomainCommandError("Stack membership is inconsistent.");
    }
  }

  card.stackId = stack.id;
  stack.cardIds.push(card.id);
  return stack;
}

export function collapseStackIfNeeded(state: RoomState, stackId: string): void {
  const stack = getStack(state, stackId);
  if (stack.cardIds.length >= 2) return;

  const remainingId = stack.cardIds[0];
  const remaining = remainingId === undefined ? undefined : state.cards.get(remainingId);
  if (remainingId !== undefined && (!remaining || remaining.stackId !== stack.id)) {
    throw new DomainCommandError("Stack membership is inconsistent.");
  }

  if (remaining) {
    remaining.stackId = undefined;
    remaining.x = stack.x;
    remaining.y = stack.y;
    remaining.zIndex = stack.zIndex;
  }
  state.stacks.delete(stack.id);
}
