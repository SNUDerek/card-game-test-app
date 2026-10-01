import { z } from "zod";
import type { PlayerId } from "./ids.js";

export interface Player {
  id: PlayerId;
  userId: string;
  displayName: string;
  connected: boolean;
  joinOrder: number;
  /**
   * Card this player's pointer is currently over, if any. Presence, not
   * ownership: hovering claims nothing and blocks no one.
   */
  hoveredCardId?: string;
}

export const CardFaceSchema = z.enum(["front", "back"]);
export type CardFace = z.infer<typeof CardFaceSchema>;

export const CardOrientationSchema = z.enum(["upright", "tapped"]);
export type CardOrientation = z.infer<typeof CardOrientationSchema>;

export interface CardInstance {
  id: string;
  definitionId: string;
  face: CardFace;
  orientation: CardOrientation;
  x: number;
  y: number;
  stackId?: string;
  zIndex: number;
}

export interface CardStack {
  id: string;
  x: number;
  y: number;
  /** Ordered bottom to top. */
  cardIds: string[];
  zIndex: number;
}

export interface ObjectLock {
  objectKind: "card" | "stack";
  objectId: string;
  playerId: string;
  expiresAt: number;
}
