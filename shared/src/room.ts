import { z } from "zod";

export const DISPLAY_NAME_MAX_LENGTH = 50;

export const JoinRoomOptionsSchema = z.object({
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH),
});

export type JoinRoomOptions = z.infer<typeof JoinRoomOptionsSchema>;

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
