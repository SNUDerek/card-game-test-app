import { z } from "zod";

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
 * Full runtime card definition served to clients, combining validated source
 * JSON with loader-computed fields (name, imageUrl, sourceName).
 */
export const CardDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  body: z.string(),
  imageUrl: z.string().min(1),
  sourceName: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CardDefinition = z.infer<typeof CardDefinitionSchema>;

export const CardCatalogResponseSchema = z.object({
  cards: z.array(CardDefinitionSchema),
});

export type CardCatalogResponse = z.infer<typeof CardCatalogResponseSchema>;
