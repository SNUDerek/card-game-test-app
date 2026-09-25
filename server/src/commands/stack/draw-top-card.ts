import { WORLD_COORDINATE_LIMIT, type DrawCardPayload } from "@card-table/shared";
import type { CardInstanceState, RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { collapseStackIfNeeded, getStack, highestTableZIndex } from "./stack-helpers.js";

export function drawTopCard(state: RoomState, payload: DrawCardPayload): CardInstanceState {
  const stack = getStack(state, payload.stackId);
  if (Math.abs(payload.x) > WORLD_COORDINATE_LIMIT || Math.abs(payload.y) > WORLD_COORDINATE_LIMIT) {
    throw new DomainCommandError(`Card position must be within ±${WORLD_COORDINATE_LIMIT} world units.`);
  }
  const cardId = stack.cardIds.at(-1);
  const card = cardId === undefined ? undefined : state.cards.get(cardId);
  if (!card || card.stackId !== stack.id || stack.cardIds.length < 2) {
    throw new DomainCommandError("Stack membership is inconsistent.");
  }
  const zIndex = highestTableZIndex(state) + 1;
  stack.cardIds.pop();
  card.stackId = undefined;
  card.x = payload.x;
  card.y = payload.y;
  card.zIndex = zIndex;
  collapseStackIfNeeded(state, stack.id);
  return card;
}
