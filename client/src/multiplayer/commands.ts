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
  type CardIdPayload,
  type FlipCardResult,
  type SetCardOrientationResult,
  type BringToFrontResult,
  type DeleteCardResult,
  ROOM_COMMANDS,
  type SessionResult,
  type StackCardPayload,
  type StackCardResult,
  type MoveStackPayload,
  type MoveStackResult,
  type DrawCardPayload,
  type DrawCardResult,
  type StackIdPayload,
  type DeleteStackResult,
  type ShuffleStackResult,
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

export function flipCard(room: Room, payload: CardIdPayload): Promise<FlipCardResult> {
  return room.request(TABLE_COMMANDS.FLIP_CARD, payload);
}

export function tapCard(
  room: Room,
  payload: CardIdPayload,
): Promise<SetCardOrientationResult> {
  return room.request(TABLE_COMMANDS.TAP_CARD, payload);
}

export function untapCard(
  room: Room,
  payload: CardIdPayload,
): Promise<SetCardOrientationResult> {
  return room.request(TABLE_COMMANDS.UNTAP_CARD, payload);
}

export function bringToFront(
  room: Room,
  payload: CardIdPayload,
): Promise<BringToFrontResult> {
  return room.request(TABLE_COMMANDS.BRING_TO_FRONT, payload);
}

export function deleteCard(room: Room, payload: CardIdPayload): Promise<DeleteCardResult> {
  return room.request(TABLE_COMMANDS.DELETE_CARD, payload);
}

export function requestSession(room: Room): Promise<SessionResult> {
  return room.request(ROOM_COMMANDS.SESSION);
}

export function stackCard(room: Room, payload: StackCardPayload): Promise<StackCardResult> {
  return room.request(TABLE_COMMANDS.STACK_CARD, payload);
}

export function moveStack(room: Room, payload: MoveStackPayload, confirmed = false): Promise<MoveStackResult | void> {
  if (confirmed) return room.request(TABLE_COMMANDS.MOVE_STACK, payload);
  room.send(TABLE_COMMANDS.MOVE_STACK, payload);
  return Promise.resolve();
}

export function drawCard(room: Room, payload: DrawCardPayload): Promise<DrawCardResult> {
  return room.request(TABLE_COMMANDS.DRAW_CARD, payload);
}

export function deleteStack(room: Room, payload: StackIdPayload): Promise<DeleteStackResult> {
  return room.request(TABLE_COMMANDS.DELETE_STACK, payload);
}

export function shuffleStack(room: Room, payload: StackIdPayload): Promise<ShuffleStackResult> {
  return room.request(TABLE_COMMANDS.SHUFFLE_STACK, payload);
}
