import { objectLockKey, type PlayerId, type TableObjectRef } from "@card-table/shared";
import { ObjectLockState, type RoomState } from "../../rooms/state/RoomState.js";
import { DomainCommandError } from "../errors.js";

function assertObjectExists(state: RoomState, object: TableObjectRef): void {
  if (object.kind === "card" && !state.cards.has(object.id)) {
    throw new DomainCommandError(`Unknown card: ${object.id}`);
  }
  if (object.kind === "stack" && !state.stacks.has(object.id)) {
    throw new DomainCommandError(`Unknown stack: ${object.id}`);
  }
}

export function claimObject(
  state: RoomState,
  playerId: PlayerId,
  object: TableObjectRef,
  now: number,
  timeoutMs: number,
): ObjectLockState {
  assertObjectExists(state, object);
  const key = objectLockKey(object);
  const existing = state.locks.get(key);
  if (existing && existing.expiresAt > now && existing.playerId !== playerId) {
    throw new DomainCommandError("Object is already claimed by another player.");
  }

  const lock = existing ??
    new ObjectLockState({
      objectKind: object.kind,
      objectId: object.id,
      playerId,
      expiresAt: now + timeoutMs,
    });
  lock.playerId = playerId;
  lock.expiresAt = now + timeoutMs;
  state.locks.set(key, lock);
  return lock;
}

export function releaseObject(
  state: RoomState,
  playerId: PlayerId,
  object: TableObjectRef,
): void {
  const key = objectLockKey(object);
  const existing = state.locks.get(key);
  if (!existing) return;
  if (existing.playerId !== playerId) {
    throw new DomainCommandError("Object is claimed by another player.");
  }
  state.locks.delete(key);
}

export function releaseExpiredLocks(state: RoomState, now: number): void {
  for (const [key, lock] of state.locks) {
    if (lock.expiresAt <= now) state.locks.delete(key);
  }
}

export function releasePlayerLocks(state: RoomState, playerId: PlayerId): void {
  for (const [key, lock] of state.locks) {
    if (lock.playerId === playerId) state.locks.delete(key);
  }
}
