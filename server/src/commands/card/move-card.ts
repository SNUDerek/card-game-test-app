import {
  WORLD_COORDINATE_LIMIT,
  objectLockKey,
  type MoveCardPayload,
  type PlayerId,
} from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";

export function moveCard(
  state: RoomState,
  playerId: PlayerId,
  payload: MoveCardPayload,
  now: number,
  lockTimeoutMs: number,
): void {
  const card = state.cards.get(payload.cardId);
  if (!card) throw new DomainCommandError(`Unknown card: ${payload.cardId}`);
  if (card.stackId !== undefined) {
    throw new DomainCommandError("Cards in a stack cannot be moved independently.");
  }
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
  lock.expiresAt = now + lockTimeoutMs;
}
