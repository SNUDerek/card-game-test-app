import { useCallback, useState } from "react";
import type { CardInstance, CardStack, Player, PlayerId } from "@card-table/shared";
import type { ClientRoomState, TableRoom } from "./room";

export interface RoomSync {
  players: Player[];
  cards: CardInstance[];
  stacks: CardStack[];
  hostPlayerId: PlayerId;
  /** Copy the room's current state, then track every subsequent patch. */
  syncRoom(room: TableRoom): void;
  /** Drop synchronized state back to its empty, disconnected form. */
  resetSync(): void;
}

/**
 * Owns the React mirror of server-authoritative room state.
 *
 * Colyseus schema instances mutate in place, so each synchronized entity is
 * copied into plain data React can render from. Adding a synchronized entity
 * means adding one block here and nothing elsewhere.
 */
export function useRoomSync(): RoomSync {
  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<CardInstance[]>([]);
  const [stacks, setStacks] = useState<CardStack[]>([]);
  const [hostPlayerId, setHostPlayerId] = useState<PlayerId>("");

  const syncRoom = useCallback((room: TableRoom) => {
    const syncState = (state: ClientRoomState) => {
      // Right after connecting, `room.state` exists but its map fields are not
      // hydrated yet: the server sends the schema reflection in the join
      // handshake, then the actual entity data in a separate, later message.
      // Skip this call and wait for the onStateChange it triggers.
      if (!state.cards || !state.stacks || !state.players) return;

      setCards(
        [...state.cards.values()].map((card) => ({
          id: card.id,
          definitionId: card.definitionId,
          face: card.face,
          orientation: card.orientation,
          x: card.x,
          y: card.y,
          stackId: card.stackId,
          zIndex: card.zIndex,
        })),
      );
      setStacks(
        [...state.stacks.values()].map((stack) => ({
          id: stack.id,
          x: stack.x,
          y: stack.y,
          cardIds: [...stack.cardIds],
          zIndex: stack.zIndex,
        })),
      );
      setPlayers(
        [...state.players.values()]
          .map((player) => ({
            id: player.id,
            displayName: player.displayName,
            connected: player.connected,
            joinOrder: player.joinOrder,
          }))
          .sort((a, b) => a.joinOrder - b.joinOrder),
      );
      setHostPlayerId(state.hostPlayerId);
    };

    syncState(room.state);
    room.onStateChange(syncState);
  }, []);

  const resetSync = useCallback(() => {
    setPlayers([]);
    setCards([]);
    setStacks([]);
    setHostPlayerId("");
  }, []);

  return { players, cards, stacks, hostPlayerId, syncRoom, resetSync };
}
