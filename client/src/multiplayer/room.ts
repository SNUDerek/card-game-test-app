import type { Room } from "@colyseus/sdk";
import type { CardInstance, CardStack, Player, PlayerId } from "@card-table/shared";

/**
 * The room state as the client sees it: Colyseus schema instances exposing the
 * same fields as the shared types, but as live maps rather than plain arrays.
 */
export interface ClientRoomState {
  cards: Map<string, CardInstance>;
  stacks: Map<string, CardStack>;
  players: Map<string, Player>;
  hostPlayerId: PlayerId;
}

export type TableRoom = Room<any, ClientRoomState>;
