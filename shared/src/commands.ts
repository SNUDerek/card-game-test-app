import { z } from "zod";
import type { PlayerId } from "./ids.js";

export const TABLE_COMMANDS = {
  SPAWN_CARD: "SPAWN_CARD",
  CLAIM_OBJECT: "CLAIM_OBJECT",
  RELEASE_OBJECT: "RELEASE_OBJECT",
  MOVE_CARD: "MOVE_CARD",
  FLIP_CARD: "FLIP_CARD",
  TAP_CARD: "TAP_CARD",
  UNTAP_CARD: "UNTAP_CARD",
  BRING_TO_FRONT: "BRING_TO_FRONT",
  DELETE_CARD: "DELETE_CARD",
  STACK_CARD: "STACK_CARD",
  MOVE_STACK: "MOVE_STACK",
  DRAW_CARD: "DRAW_CARD",
  DELETE_STACK: "DELETE_STACK",
} as const;

/**
 * Room-session commands. Unlike TABLE_COMMANDS these do not mutate the
 * tabletop; they let a connection ask about itself.
 */
export const ROOM_COMMANDS = {
  /**
   * Asks which synchronized player this connection is. PlayerIds are
   * server-generated and deliberately independent of the Colyseus session id,
   * so a client cannot derive this on its own.
   */
  SESSION: "SESSION",
} as const;

export interface SessionResult {
  playerId: PlayerId;
}

export const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const SpawnCardPayloadSchema = PositionSchema.extend({
  definitionId: z.string().min(1),
});

export type SpawnCardPayload = z.infer<typeof SpawnCardPayloadSchema>;

export interface SpawnCardResult {
  cardId: string;
}

export const TableObjectRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("card"), id: z.string().min(1) }),
  z.object({ kind: z.literal("stack"), id: z.string().min(1) }),
]);

export type TableObjectRef = z.infer<typeof TableObjectRefSchema>;

export const ClaimObjectPayloadSchema = z.object({ object: TableObjectRefSchema });
export type ClaimObjectPayload = z.infer<typeof ClaimObjectPayloadSchema>;

export const ReleaseObjectPayloadSchema = z.object({ object: TableObjectRefSchema });
export type ReleaseObjectPayload = z.infer<typeof ReleaseObjectPayloadSchema>;

export interface ClaimObjectResult {
  expiresAt: number;
}

export interface ReleaseObjectResult {
  released: true;
}

export const MoveCardPayloadSchema = PositionSchema.extend({
  cardId: z.string().min(1),
});
export type MoveCardPayload = z.infer<typeof MoveCardPayloadSchema>;

export interface MoveCardResult {
  moved: true;
}

export const CardIdPayloadSchema = z.object({ cardId: z.string().min(1) });
export type CardIdPayload = z.infer<typeof CardIdPayloadSchema>;

export interface FlipCardResult {
  face: "front" | "back";
}

export interface SetCardOrientationResult {
  orientation: "upright" | "tapped";
}

export interface BringToFrontResult {
  zIndex: number;
}

export interface DeleteCardResult {
  deleted: true;
}

export const StackCardPayloadSchema = z.object({
  cardId: z.string().min(1),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("card"), cardId: z.string().min(1) }),
    z.object({ kind: z.literal("stack"), stackId: z.string().min(1) }),
  ]),
});
export type StackCardPayload = z.infer<typeof StackCardPayloadSchema>;

export interface StackCardResult {
  stackId: string;
}

export const MoveStackPayloadSchema = PositionSchema.extend({ stackId: z.string().min(1) });
export type MoveStackPayload = z.infer<typeof MoveStackPayloadSchema>;
export interface MoveStackResult { moved: true }

export const DrawCardPayloadSchema = PositionSchema.extend({ stackId: z.string().min(1) });
export type DrawCardPayload = z.infer<typeof DrawCardPayloadSchema>;
export interface DrawCardResult { cardId: string }

export const StackIdPayloadSchema = z.object({ stackId: z.string().min(1) });
export type StackIdPayload = z.infer<typeof StackIdPayloadSchema>;
export interface DeleteStackResult { deleted: true }

export function objectLockKey(object: TableObjectRef): string {
  return `${object.kind}:${object.id}`;
}

/** Domain bound applied by the authoritative server after structural validation. */
export const WORLD_COORDINATE_LIMIT = 1_000_000;
