import { DeckEntrySchema, type GeneratedDeck } from "@card-table/shared";
import { z } from "zod";
import { apiRequest } from "../../../api/client";

/** Response shapes of the deck routes; shared only declares their TypeScript types. */
export const DeckSummarySchema = z.object({
  id: z.string(),
  setId: z.string(),
  name: z.string(),
  description: z.string(),
  revision: z.number().int(),
  cardCount: z.number().int(),
  updatedAt: z.number(),
});

export const DeckWithEntriesSchema = DeckSummarySchema.extend({
  entries: z.array(DeckEntrySchema),
});

export const DeckListResponseSchema = z.object({ decks: z.array(DeckSummarySchema) });
export const DeckResponseSchema = z.object({ deck: DeckWithEntriesSchema });
export const GeneratedDeckSchema = z.object({ entries: z.array(DeckEntrySchema), seed: z.string() });

/** Total physical cards across deck entries. */
export function totalCopies(entries: readonly { copies: number }[]): number {
  return entries.reduce((sum, entry) => sum + entry.copies, 0);
}

export interface GenerateDeckOptions {
  size: number;
  maxCopies: number;
  /** Blank lets the server pick one; the result reports it either way. */
  seed?: string;
  /** Empty means every type is eligible. */
  includeTypes?: string[];
}

/** Rolls a random deck from a set's active cards without saving it. */
export async function generateDeck(setId: string, options: GenerateDeckOptions): Promise<GeneratedDeck> {
  const seed = options.seed?.trim();
  const params = {
    size: options.size,
    maxCopies: options.maxCopies,
    ...(seed && { seed }),
    ...(options.includeTypes?.length && { includeTypes: options.includeTypes }),
  };
  return apiRequest(`/api/sets/${setId}/decks/generate`, GeneratedDeckSchema, {
    method: "POST",
    body: JSON.stringify({ params }),
  });
}
