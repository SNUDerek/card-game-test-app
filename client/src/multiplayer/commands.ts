import {
  TABLE_COMMANDS,
  type ClaimObjectPayload,
  type ClaimObjectResult,
  type ReleaseObjectPayload,
  type ReleaseObjectResult,
  type MoveCardPayload,
  type MoveCardResult,
  type SpawnCardPayload,
  type SpawnCardResult,
} from "@card-table/shared";
import type { Room } from "@colyseus/sdk";

export function spawnCard(room: Room, payload: SpawnCardPayload): Promise<SpawnCardResult> {
  return room.request(TABLE_COMMANDS.SPAWN_CARD, payload);
}

export function moveCard(
  room: Room,
  payload: MoveCardPayload,
  confirmed = false,
): Promise<MoveCardResult | void> {
  if (confirmed) return room.request(TABLE_COMMANDS.MOVE_CARD, payload);
  room.send(TABLE_COMMANDS.MOVE_CARD, payload);
  return Promise.resolve();
}

export function claimObject(
  room: Room,
  payload: ClaimObjectPayload,
): Promise<ClaimObjectResult> {
  return room.request(TABLE_COMMANDS.CLAIM_OBJECT, payload);
}

export function releaseObject(
  room: Room,
  payload: ReleaseObjectPayload,
): Promise<ReleaseObjectResult> {
  return room.request(TABLE_COMMANDS.RELEASE_OBJECT, payload);
}
