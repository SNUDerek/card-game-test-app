import { z } from "zod";
import type { PlayerId } from "./ids.js";

export const DISPLAY_NAME_MAX_LENGTH = 50;
export const ROOM_PASSWORD_MAX_LENGTH = 128;

/**
 * Options sent with both room creation and room join. On creation the password
 * *sets* the room password; on join it *proves* knowledge of it. It is only
 * ever sent to the server — neither the password nor its hash is part of
 * synchronized room state.
 */
export const JoinRoomOptionsSchema = z.object({
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH),
  password: z.string().min(1).max(ROOM_PASSWORD_MAX_LENGTH).optional(),
});

export type JoinRoomOptions = z.infer<typeof JoinRoomOptionsSchema>;

export interface Player {
  id: PlayerId;
  displayName: string;
  connected: boolean;
  joinOrder: number;
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

export interface ObjectLock {
  objectKind: "card";
  objectId: string;
  playerId: string;
  expiresAt: number;
}
