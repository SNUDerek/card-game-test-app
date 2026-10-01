import { z } from "zod";

/** Most copies of one card a deck may hold; matches the deck_cards CHECK constraint. */
export const MAX_DECK_ENTRY_COPIES = 99;
/** Structural ceiling on deck size. The room's own card cap is checked by the server. */
export const MAX_DECK_SIZE = 500;

/** One line of a deck: a card definition and how many physical copies of it. */
export const DeckEntrySchema = z.object({
  cardId: z.string().min(1),
  copies: z.number().int().min(1).max(MAX_DECK_ENTRY_COPIES),
});

export type DeckEntry = z.infer<typeof DeckEntrySchema>;

export const DeckEntriesSchema = z.array(DeckEntrySchema).min(1).max(MAX_DECK_SIZE);

/**
 * Inputs to random deck generation. Whether the request can be satisfied by a
 * particular set's cards is a domain question, answered by the generator.
 */
export const DeckGenerationParamsSchema = z.object({
  size: z.number().int().min(1).max(MAX_DECK_SIZE),
  maxCopies: z.number().int().min(1).max(MAX_DECK_ENTRY_COPIES),
  /** Only cards of these types are eligible. Omitted means every type. */
  includeTypes: z.array(z.string().min(1)).min(1).optional(),
  /** Same seed, same cards, same result. Generated when omitted. */
  seed: z.string().min(1).max(64).optional(),
});

export type DeckGenerationParams = z.infer<typeof DeckGenerationParamsSchema>;

export interface GeneratedDeck {
  entries: DeckEntry[];
  /** The seed actually used, so a result can be reproduced or shared. */
  seed: string;
}
