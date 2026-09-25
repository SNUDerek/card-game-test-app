import type { DrawCardPayload, PlayerId } from "@card-table/shared";
import type { CardInstanceState, RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { rejectForeignLock } from "../player/object-locks.js";
import { assertWorldPosition } from "../world-position.js";
import { collapseStackIfNeeded, getStack, highestTableZIndex } from "./stack-helpers.js";

export function drawTopCard(
  state: RoomState,
  playerId: PlayerId,
  payload: DrawCardPayload,
  now: number,
): CardInstanceState {
  const stack = getStack(state, payload.stackId);
  rejectForeignLock(
    state,
    playerId,
    { kind: "stack", id: stack.id },
    now,
    "The stack is claimed by another player.",
  );
  assertWorldPosition(payload);
  const cardId = stack.cardIds.at(-1);
  const card = cardId === undefined ? undefined : state.cards.get(cardId);
  if (!card || card.stackId !== stack.id || stack.cardIds.length < 2) {
    throw new DomainCommandError("Stack membership is inconsistent.");
  }
  rejectForeignLock(
    state,
    playerId,
    { kind: "card", id: card.id },
    now,
    "The top card is claimed by another player.",
  );
  const zIndex = highestTableZIndex(state) + 1;
  stack.cardIds.pop();
  card.stackId = undefined;
  card.x = payload.x;
  card.y = payload.y;
  card.zIndex = zIndex;
  collapseStackIfNeeded(state, stack.id);
  return card;
}
