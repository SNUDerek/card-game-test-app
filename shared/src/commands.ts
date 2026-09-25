import { z } from "zod";

export const TABLE_COMMANDS = {
  SPAWN_CARD: "SPAWN_CARD",
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

/** Domain bound applied by the authoritative server after structural validation. */
export const WORLD_COORDINATE_LIMIT = 1_000_000;
