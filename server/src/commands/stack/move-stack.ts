import { objectLockKey, type MoveStackPayload, type PlayerId } from "@card-table/shared";
import type { RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";
import { assertWorldPosition } from "../world-position.js";
import { bringStackToFrontIfNeeded, getStack } from "./stack-helpers.js";

export function moveStack(state: RoomState, playerId: PlayerId, payload: MoveStackPayload, now: number, timeoutMs: number): void {
  const stack = getStack(state, payload.stackId);
  assertWorldPosition(payload, "Stack");
  const key = objectLockKey({ kind: "stack", id: stack.id });
  const lock = state.locks.get(key);
  if (!lock || lock.expiresAt <= now || lock.playerId !== playerId) {
    if (lock && lock.expiresAt <= now) state.locks.delete(key);
    throw new DomainCommandError("The stack must be claimed by this player before moving.");
  }
  stack.x = payload.x;
  stack.y = payload.y;
  bringStackToFrontIfNeeded(state, stack.id);
  lock.expiresAt = now + timeoutMs;
}
