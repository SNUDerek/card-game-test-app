import { z } from "zod";

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
} as const;

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

export const TableObjectRefSchema = z.object({
  kind: z.literal("card"),
  id: z.string().min(1),
});

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

export function objectLockKey(object: TableObjectRef): string {
  return `${object.kind}:${object.id}`;
}

/** Domain bound applied by the authoritative server after structural validation. */
export const WORLD_COORDINATE_LIMIT = 1_000_000;
