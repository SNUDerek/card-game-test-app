import { WORLD_COORDINATE_LIMIT, objectLockKey, type MoveStackPayload, type PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { getStack, highestTableZIndex } from "./stack-helpers.js";

export function moveStack(state: RoomState, playerId: PlayerId, payload: MoveStackPayload, now: number, timeoutMs: number): void {
  const stack = getStack(state, payload.stackId);
  if (Math.abs(payload.x) > WORLD_COORDINATE_LIMIT || Math.abs(payload.y) > WORLD_COORDINATE_LIMIT) {
    throw new DomainCommandError(`Stack position must be within ±${WORLD_COORDINATE_LIMIT} world units.`);
  }
  const key = objectLockKey({ kind: "stack", id: stack.id });
  const lock = state.locks.get(key);
  if (!lock || lock.expiresAt <= now || lock.playerId !== playerId) {
    if (lock && lock.expiresAt <= now) state.locks.delete(key);
    throw new DomainCommandError("The stack must be claimed by this player before moving.");
  }
  stack.x = payload.x;
  stack.y = payload.y;
  const highest = highestTableZIndex(state);
  if (stack.zIndex < highest) stack.zIndex = highest + 1;
  lock.expiresAt = now + timeoutMs;
}
