import type { PlayerId } from "./ids.js";

/** Server → client events that are not part of synchronized room state. */
export const ROOM_EVENTS = {
  /**
   * Sent to one client on join and again on successful reconnection, so it
   * knows which synchronized player is itself. PlayerIds are server-generated
   * and deliberately independent of the Colyseus session id.
   */
  SESSION: "SESSION",
} as const;

export interface SessionEvent {
  playerId: PlayerId;
}
