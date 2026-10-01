import { z } from "zod";
import type { PlayerId } from "./ids.js";
import { CardFaceSchema } from "./room.js";
import { DeckEntriesSchema } from "./decks.js";
import { DESCRIPTION_MAX_LENGTH, ROOM_NAME_MAX_LENGTH } from "./library.js";

export const TABLE_COMMANDS = {
  SPAWN_CARD: "SPAWN_CARD",
  SPAWN_DECK: "SPAWN_DECK",
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
  SHUFFLE_STACK: "SHUFFLE_STACK",
  DELETE_STACK: "DELETE_STACK",
  SET_HOVER: "SET_HOVER",
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
  UPDATE_ROOM_METADATA: "UPDATE_ROOM_METADATA",
  KEEP_OPEN: "KEEP_OPEN",
} as const;

/** Messages the server broadcasts to every client in a room. */
export const ROOM_EVENTS = {
  /** A card or the set bound to this room was edited in the library. */
  CATALOG_CHANGED: "CATALOG_CHANGED",
  /** Someone ended the room; members are about to be disconnected. */
  ROOM_ENDED: "ROOM_ENDED",
  ROOM_IDLE_WARNING: "ROOM_IDLE_WARNING",
  ROOM_IDLE_RESUMED: "ROOM_IDLE_RESUMED",
} as const;

export interface CatalogChangedEvent {
  setId: string;
  /** Cards created, edited, archived, or restored. Empty for set-only edits. */
  changedCardIds: string[];
  /** Display name of whoever made the change, when known. */
  editorName: string | null;
}

export interface RoomEndedEvent {
  message: string;
}

export interface RoomIdleWarningEvent { endsAt: number }

export const UpdateRoomMetadataPayloadSchema = z.object({
  name: z.string().trim().min(1).max(ROOM_NAME_MAX_LENGTH).optional(),
  description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
}).refine((value) => value.name !== undefined || value.description !== undefined, {
  message: "Provide a room name or description.",
});
export type UpdateRoomMetadataPayload = z.infer<typeof UpdateRoomMetadataPayloadSchema>;

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

/**
 * Deals a whole deck as one stack. A discriminated union so a saved deck
 * (`source: "deck"`, by id) can join the inline entries a generated but
 * unsaved deck sends.
 */
export const SpawnDeckPayloadSchema = z.discriminatedUnion("source", [
  PositionSchema.extend({
    source: z.literal("entries"),
    entries: DeckEntriesSchema,
    shuffle: z.boolean(),
    face: CardFaceSchema,
  }),
  PositionSchema.extend({
    source: z.literal("deck"),
    deckId: z.string().uuid(),
    shuffle: z.boolean(),
    face: CardFaceSchema,
  }),
]);

export type SpawnDeckPayload = z.infer<typeof SpawnDeckPayloadSchema>;

/** A one-card deck is dealt as a standalone card, so it has no stack. */
export type SpawnDeckResult =
  | { kind: "stack"; stackId: string; cardCount: number }
  | { kind: "card"; cardId: string };

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

/**
 * The shuffled order is chosen by the server. Clients never supply a
 * permutation or a seed, so a client cannot predict or dictate the result.
 */
export interface ShuffleStackResult { shuffled: true }

/**
 * Reports where this player's pointer is, or `null` when it leaves a card.
 * Unlike every other command here this claims nothing and mutates no card: it
 * only updates the sender's own presence.
 */
export const SetHoverPayloadSchema = z.object({
  cardId: z.string().min(1).nullable(),
});
export type SetHoverPayload = z.infer<typeof SetHoverPayloadSchema>;
export interface SetHoverResult { hovering: boolean }

export function objectLockKey(object: TableObjectRef): string {
  return `${object.kind}:${object.id}`;
}

/** Domain bound applied by the authoritative server after structural validation. */
export const WORLD_COORDINATE_LIMIT = 1_000_000;
