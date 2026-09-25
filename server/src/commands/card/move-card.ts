import {
  WORLD_COORDINATE_LIMIT,
  objectLockKey,
  type MoveCardPayload,
  type PlayerId,
} from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { bringToFrontIfNeeded } from "./bring-to-front.js";
import { getStandaloneCard } from "./card-access.js";

export function moveCard(
  state: RoomState,
  playerId: PlayerId,
  payload: MoveCardPayload,
  now: number,
  lockTimeoutMs: number,
): void {
  const card = getStandaloneCard(state, payload.cardId);
  if (
    Math.abs(payload.x) > WORLD_COORDINATE_LIMIT ||
    Math.abs(payload.y) > WORLD_COORDINATE_LIMIT
  ) {
    throw new DomainCommandError(
      `Card position must be within ±${WORLD_COORDINATE_LIMIT} world units.`,
    );
  }

  const lockKey = objectLockKey({ kind: "card", id: payload.cardId });
  const lock = state.locks.get(lockKey);
  if (!lock || lock.expiresAt <= now || lock.playerId !== playerId) {
    if (lock?.expiresAt !== undefined && lock.expiresAt <= now) state.locks.delete(lockKey);
    throw new DomainCommandError("The card must be claimed by this player before moving.");
  }

  card.x = payload.x;
  card.y = payload.y;
  bringToFrontIfNeeded(state, payload.cardId);
  lock.expiresAt = now + lockTimeoutMs;
}
