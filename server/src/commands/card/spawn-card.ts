import { randomUUID } from "node:crypto";
import {
  WORLD_COORDINATE_LIMIT,
  type CardDefinitionId,
  type SpawnCardPayload,
} from "@card-table/shared";
import { CardInstanceState, type RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";

export function spawnCard(
  state: RoomState,
  definitionIds: ReadonlySet<CardDefinitionId>,
  payload: SpawnCardPayload,
  createId: () => string = randomUUID,
): CardInstanceState {
  if (!definitionIds.has(payload.definitionId)) {
    throw new DomainCommandError(`Unknown card definition: ${payload.definitionId}`);
  }
  if (
    Math.abs(payload.x) > WORLD_COORDINATE_LIMIT ||
    Math.abs(payload.y) > WORLD_COORDINATE_LIMIT
  ) {
    throw new DomainCommandError(
      `Card position must be within ±${WORLD_COORDINATE_LIMIT} world units.`,
    );
  }

  const zIndex = [...state.cards.values()].reduce(
    (highest, card) => Math.max(highest, card.zIndex),
    -1,
  ) + 1;
  const card = new CardInstanceState({
    id: createId(),
    definitionId: payload.definitionId,
    face: "front",
    orientation: "upright",
    x: payload.x,
    y: payload.y,
    zIndex,
  });

  state.cards.set(card.id, card);
  return card;
}
