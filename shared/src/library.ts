import { z } from "zod";
import { DeckEntrySchema, MAX_DECK_SIZE } from "./decks.js";

export const SET_NAME_MAX_LENGTH = 100;
export const DECK_NAME_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2_000;
export const CARD_NAME_MAX_LENGTH = 100;
export const CARD_TYPE_MAX_LENGTH = 50;
export const CARD_BODY_MAX_LENGTH = 2_000;

/** Every editable library row carries a revision for optimistic concurrency. */
export const RevisionSchema = z.number().int().min(1);

export const CardSetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  forkedFromSetId: z.string().min(1).nullable(),
  revision: RevisionSchema,
  archived: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type CardSet = z.infer<typeof CardSetSchema>;

/** A set as the set list shows it: counts of active cards and decks, plus lineage. */
export const CardSetSummarySchema = CardSetSchema.extend({
  forkedFromSetName: z.string().nullable(),
  cardCount: z.number().int().min(0),
  deckCount: z.number().int().min(0),
});

export type CardSetSummary = z.infer<typeof CardSetSummarySchema>;

export const CreateCardSetRequestSchema = z.object({
  name: z.string().trim().min(1).max(SET_NAME_MAX_LENGTH),
  description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).default(""),
});

export type CreateCardSetRequest = z.infer<typeof CreateCardSetRequestSchema>;

export const UpdateCardSetRequestSchema = z.object({
  name: z.string().trim().min(1).max(SET_NAME_MAX_LENGTH).optional(),
  description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
  revision: RevisionSchema,
});

export type UpdateCardSetRequest = z.infer<typeof UpdateCardSetRequestSchema>;

export const ForkCardSetRequestSchema = z.object({
  name: z.string().trim().min(1).max(SET_NAME_MAX_LENGTH),
});

export type ForkCardSetRequest = z.infer<typeof ForkCardSetRequestSchema>;

/** Image ids are the lowercase hex SHA-256 of the stored bytes. */
export const ImageIdSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const LibraryImageSchema = z.object({
  id: ImageIdSchema,
  mime: z.enum(["image/png", "image/jpeg"]),
  width: z.number().int(),
  height: z.number().int(),
  byteSize: z.number().int(),
  createdAt: z.number().int(),
});

export type LibraryImage = z.infer<typeof LibraryImageSchema>;

export const CardContentSchema = z.object({
  name: z.string().trim().min(1).max(CARD_NAME_MAX_LENGTH),
  type: z.string().trim().min(1).max(CARD_TYPE_MAX_LENGTH),
  body: z.string().max(CARD_BODY_MAX_LENGTH),
  imageId: ImageIdSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CardContent = z.infer<typeof CardContentSchema>;

export const CreateCardRequestSchema = CardContentSchema;
export type CreateCardRequest = z.infer<typeof CreateCardRequestSchema>;

export const UpdateCardRequestSchema = CardContentSchema.extend({ revision: RevisionSchema });
export type UpdateCardRequest = z.infer<typeof UpdateCardRequestSchema>;

/** A card definition as stored in the library: one set's card, with its edit history markers. */
export interface LibraryCard extends CardContent {
  id: string;
  setId: string;
  position: number;
  revision: number;
  archived: boolean;
  updatedAt: number;
}

/** A deck's entries hold each card at most once. */
export const LibraryDeckEntriesSchema = z
  .array(DeckEntrySchema)
  .max(MAX_DECK_SIZE)
  .refine(
    (entries) => new Set(entries.map((entry) => entry.cardId)).size === entries.length,
    "Each card may appear only once in a deck.",
  );

export const SaveDeckRequestSchema = z.object({
  name: z.string().trim().min(1).max(DECK_NAME_MAX_LENGTH),
  description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).default(""),
  entries: LibraryDeckEntriesSchema,
});

export type SaveDeckRequest = z.infer<typeof SaveDeckRequestSchema>;

export const UpdateDeckRequestSchema = SaveDeckRequestSchema.extend({ revision: RevisionSchema });
export type UpdateDeckRequest = z.infer<typeof UpdateDeckRequestSchema>;

export interface DeckSummary {
  id: string;
  setId: string;
  name: string;
  description: string;
  revision: number;
  /** Total physical cards: the sum of every entry's copies. */
  cardCount: number;
  updatedAt: number;
}

export interface DeckWithEntries extends DeckSummary {
  entries: { cardId: string; copies: number }[];
}
