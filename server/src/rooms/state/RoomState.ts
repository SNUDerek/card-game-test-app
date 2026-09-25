import { schema, t, type SchemaType } from "@colyseus/schema";
import type { CardFace, CardOrientation } from "@card-table/shared";

export const PlayerState = schema(
  {
    id: t.string(),
    displayName: t.string(),
    connected: t.boolean().default(true),
    joinOrder: t.number(),
    /**
     * Presence only: the card this player's pointer is over. Carries no claim
     * on the card and never gates a command — see commands/player/set-hover.
     */
    hoveredCardId: t.string().optional(),
  },
  "Player",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const CardInstanceState = schema(
  {
    id: t.string(),
    definitionId: t.string(),
    face: t.string<CardFace>(),
    orientation: t.string<CardOrientation>(),
    x: t.number(),
    y: t.number(),
    stackId: t.string().optional(),
    zIndex: t.number(),
  },
  "CardInstance",
);
export type CardInstanceState = SchemaType<typeof CardInstanceState>;

export const CardStackState = schema(
  {
    id: t.string(),
    x: t.number(),
    y: t.number(),
    cardIds: t.array("string"),
    zIndex: t.number(),
  },
  "CardStack",
);
export type CardStackState = SchemaType<typeof CardStackState>;

export const ObjectLockState = schema(
  {
    objectKind: t.string<"card" | "stack">(),
    objectId: t.string(),
    playerId: t.string(),
    expiresAt: t.number(),
  },
  "ObjectLock",
);
export type ObjectLockState = SchemaType<typeof ObjectLockState>;

export const RoomState = schema(
  {
    cards: t.map(CardInstanceState),
    stacks: t.map(CardStackState),
    players: t.map(PlayerState),
    locks: t.map(ObjectLockState),
    /**
     * Canonical room host. Clients decide whether they are host by comparing
     * their own PlayerId against this; there is no per-player host flag.
     * Empty only before the first player joins.
     */
    hostPlayerId: t.string().default(""),
  },
  "RoomState",
);
export type RoomState = SchemaType<typeof RoomState>;
