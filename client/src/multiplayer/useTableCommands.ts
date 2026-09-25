import { useCallback, useMemo, type RefObject } from "react";
import type {
  ClaimObjectResult,
  DrawCardPayload,
  MoveCardPayload,
  MoveStackPayload,
  SpawnCardPayload,
  StackCardPayload,
  TableObjectRef,
} from "@card-table/shared";
import {
  bringToFront as sendBringToFront,
  claimObject as sendClaimObject,
  deleteCard as sendDeleteCard,
  deleteStack as sendDeleteStack,
  drawCard as sendDrawCard,
  flipCard as sendFlipCard,
  moveCard as sendMoveCard,
  moveStack as sendMoveStack,
  releaseObject as sendReleaseObject,
  spawnCard as sendSpawnCard,
  stackCard as sendStackCard,
  tapCard as sendTapCard,
  untapCard as sendUntapCard,
} from "./commands";
import type { TableRoom } from "./room";

export interface TableCommands {
  spawnCard(payload: SpawnCardPayload): Promise<void>;
  claimObject(object: TableObjectRef): Promise<ClaimObjectResult>;
  releaseObject(object: TableObjectRef): Promise<void>;
  moveCard(payload: MoveCardPayload, confirmed?: boolean): Promise<void>;
  flipCard(cardId: string): Promise<void>;
  tapCard(cardId: string): Promise<void>;
  untapCard(cardId: string): Promise<void>;
  bringToFront(cardId: string): Promise<void>;
  deleteCard(cardId: string): Promise<void>;
  stackCard(payload: StackCardPayload): Promise<void>;
  moveStack(payload: MoveStackPayload, confirmed?: boolean): Promise<void>;
  drawCard(payload: DrawCardPayload): Promise<void>;
  deleteStack(stackId: string): Promise<void>;
}

export const NOT_CONNECTED_MESSAGE = "The tabletop is not connected yet.";

/**
 * Binds the command layer in ./commands to the currently connected room.
 *
 * These wrappers carry no logic of their own: they supply the room and reject
 * when there is none. The room lives in a ref, so the returned object keeps a
 * stable identity for the life of the provider and never re-renders consumers.
 */
export function useTableCommands(roomRef: RefObject<TableRoom | null>): TableCommands {
  const withRoom = useCallback(
    <T,>(send: (room: TableRoom) => Promise<T>) => {
      const room = roomRef.current;
      if (!room) return Promise.reject(new Error(NOT_CONNECTED_MESSAGE));
      return send(room);
    },
    [roomRef],
  );

  return useMemo<TableCommands>(
    () => ({
      spawnCard: (payload) => withRoom(async (room) => void (await sendSpawnCard(room, payload))),
      claimObject: (object) => withRoom((room) => sendClaimObject(room, { object })),
      releaseObject: (object) =>
        withRoom(async (room) => void (await sendReleaseObject(room, { object }))),
      moveCard: (payload, confirmed = false) =>
        withRoom(async (room) => void (await sendMoveCard(room, payload, confirmed))),
      flipCard: (cardId) => withRoom(async (room) => void (await sendFlipCard(room, { cardId }))),
      tapCard: (cardId) => withRoom(async (room) => void (await sendTapCard(room, { cardId }))),
      untapCard: (cardId) => withRoom(async (room) => void (await sendUntapCard(room, { cardId }))),
      bringToFront: (cardId) =>
        withRoom(async (room) => void (await sendBringToFront(room, { cardId }))),
      deleteCard: (cardId) =>
        withRoom(async (room) => void (await sendDeleteCard(room, { cardId }))),
      stackCard: (payload) => withRoom(async (room) => void (await sendStackCard(room, payload))),
      moveStack: (payload, confirmed = false) =>
        withRoom(async (room) => void (await sendMoveStack(room, payload, confirmed))),
      drawCard: (payload) => withRoom(async (room) => void (await sendDrawCard(room, payload))),
      deleteStack: (stackId) =>
        withRoom(async (room) => void (await sendDeleteStack(room, { stackId }))),
    }),
    [withRoom],
  );
}
