import { randomUUID } from "node:crypto";
import type { CardDefinitionId, SpawnCardPayload } from "@card-table/shared";
import { CardInstanceState, type RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { assertWorldPosition } from "../world-position.js";
import { highestTableZIndex } from "../stack/stack-helpers.js";

/**
 * Upper bound on table occupancy. Nothing else caps room state growth, so
 * without this a client can spawn until the room runs out of memory — rate
 * limiting only slows that down, it does not stop it.
 */
export const MAX_CARDS_PER_ROOM = 500;

export function spawnCard(
  state: RoomState,
  definitionIds: ReadonlySet<CardDefinitionId>,
  payload: SpawnCardPayload,
  createId: () => string = randomUUID,
): CardInstanceState {
  if (!definitionIds.has(payload.definitionId)) {
    throw new DomainCommandError(`Unknown card definition: ${payload.definitionId}`);
  }
  assertWorldPosition(payload);
  if (state.cards.size >= MAX_CARDS_PER_ROOM) {
    throw new DomainCommandError(
      `A table holds at most ${MAX_CARDS_PER_ROOM} cards; delete some before spawning more.`,
    );
  }

  const card = new CardInstanceState({
    id: createId(),
    definitionId: payload.definitionId,
    face: "front",
    orientation: "upright",
    x: payload.x,
    y: payload.y,
    zIndex: highestTableZIndex(state) + 1,
  });

  state.cards.set(card.id, card);
  return card;
}
