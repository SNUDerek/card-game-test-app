import { z } from "zod";

/** Card artwork is square, with a side length in this range (pixels). */
export const CARD_IMAGE_MIN_SIZE = 32;
export const CARD_IMAGE_MAX_SIZE = 512;

/**
 * Minimum fields required in a card's source JSON file. Unknown fields are
 * preserved (not stripped) so the loader can carry them into `metadata`.
 */
export const CardDefinitionSourceSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    body: z.string(),
  })
  .passthrough();

export type CardDefinitionSource = z.infer<typeof CardDefinitionSourceSchema>;

/**
 * A card definition as clients receive it: one card of a library set, plus the
 * URL its artwork is served from. Table instances reference it by `id`.
 *
 * Deliberately looser than the library's write schemas, so a card stored before
 * a limit changed still reaches the table instead of failing the whole list.
 */
export const CardDefinitionSchema = z.object({
  id: z.string().min(1),
  setId: z.string().min(1),
  name: z.string(),
  type: z.string(),
  body: z.string(),
  imageId: z.string().min(1),
  imageUrl: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  position: z.number().int(),
  revision: z.number().int(),
  archived: z.boolean(),
  updatedAt: z.number().int(),
});

export type CardDefinition = z.infer<typeof CardDefinitionSchema>;

/** `GET /api/sets/:setId/cards` */
export const SetCardsResponseSchema = z.object({
  cards: z.array(CardDefinitionSchema),
});

export type SetCardsResponse = z.infer<typeof SetCardsResponseSchema>;

/** Where the server serves an uploaded image, by its content-hash id. */
export function cardImageUrl(imageId: string): string {
  return `/images/${imageId}`;
}
