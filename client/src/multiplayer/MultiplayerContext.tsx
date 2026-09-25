import { Client, type Room } from "@colyseus/sdk";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CardInstance,
  ClaimObjectResult,
  SpawnCardPayload,
  MoveCardPayload,
  TableObjectRef,
} from "@card-table/shared";
import {
  claimObject as sendClaimObject,
  releaseObject as sendReleaseObject,
  moveCard as sendMoveCard,
  spawnCard as sendSpawnCard,
  flipCard as sendFlipCard,
  tapCard as sendTapCard,
  untapCard as sendUntapCard,
  bringToFront as sendBringToFront,
  deleteCard as sendDeleteCard,
} from "./commands";

interface ClientRoomState {
  cards: Map<string, CardInstance>;
}

interface MultiplayerValue {
  cards: CardInstance[];
  connectionError: string | null;
  spawnCard(payload: SpawnCardPayload): Promise<void>;
  claimObject(object: TableObjectRef): Promise<ClaimObjectResult>;
  releaseObject(object: TableObjectRef): Promise<void>;
  moveCard(payload: MoveCardPayload, confirmed?: boolean): Promise<void>;
  flipCard(cardId: string): Promise<void>;
  tapCard(cardId: string): Promise<void>;
  untapCard(cardId: string): Promise<void>;
  bringToFront(cardId: string): Promise<void>;
  deleteCard(cardId: string): Promise<void>;
}

const MultiplayerContext = createContext<MultiplayerValue | null>(null);

function serverEndpoint(): string {
  if (import.meta.env.VITE_COLYSEUS_URL) return import.meta.env.VITE_COLYSEUS_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:2567`;
}

function displayName(): string {
  const storageKey = "card-table-display-name";
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const generated = `Player-${crypto.randomUUID().slice(0, 8)}`;
  sessionStorage.setItem(storageKey, generated);
  return generated;
}

export function MultiplayerProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<Room<any, ClientRoomState> | null>(null);
  const [cards, setCards] = useState<CardInstance[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let joinedRoom: Room<any, ClientRoomState> | undefined;

    void new Client(serverEndpoint())
      .joinOrCreate<ClientRoomState>("table", { displayName: displayName() })
      .then((nextRoom) => {
        joinedRoom = nextRoom;
        if (!active) {
          void nextRoom.leave();
          return;
        }

        const syncCards = (state: ClientRoomState) => {
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
        };
        syncCards(nextRoom.state);
        nextRoom.onStateChange(syncCards);
        nextRoom.onLeave(() => {
          if (active) setConnectionError("Disconnected from the tabletop server.");
        });
        setRoom(nextRoom);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        console.error("Failed to connect to tabletop room:", cause);
        setConnectionError("Could not connect to the tabletop server.");
      });

    return () => {
      active = false;
      if (joinedRoom) void joinedRoom.leave();
    };
  }, []);

  const spawnCard = useCallback(
    async (payload: SpawnCardPayload) => {
      if (!room) throw new Error("The tabletop is not connected yet.");
      await sendSpawnCard(room, payload);
    },
    [room],
  );

  const claimObject = useCallback(
    async (object: TableObjectRef) => {
      if (!room) throw new Error("The tabletop is not connected yet.");
      return sendClaimObject(room, { object });
    },
    [room],
  );

  const releaseObject = useCallback(
    async (object: TableObjectRef) => {
      if (!room) throw new Error("The tabletop is not connected yet.");
      await sendReleaseObject(room, { object });
    },
    [room],
  );

  const moveCard = useCallback(
    async (payload: MoveCardPayload, confirmed = false) => {
      if (!room) throw new Error("The tabletop is not connected yet.");
      await sendMoveCard(room, payload, confirmed);
    },
    [room],
  );

  const flipCard = useCallback(
    async (cardId: string) => {
      if (!room) throw new Error("The tabletop is not connected yet.");
      await sendFlipCard(room, { cardId });
    },
    [room],
  );

  const tapCard = useCallback(
    async (cardId: string) => {
      if (!room) throw new Error("The tabletop is not connected yet.");
      await sendTapCard(room, { cardId });
    },
    [room],
  );

  const untapCard = useCallback(
    async (cardId: string) => {
      if (!room) throw new Error("The tabletop is not connected yet.");
      await sendUntapCard(room, { cardId });
    },
    [room],
  );

  const bringToFront = useCallback(
    async (cardId: string) => {
      if (!room) throw new Error("The tabletop is not connected yet.");
      await sendBringToFront(room, { cardId });
    },
    [room],
  );

  const deleteCard = useCallback(
    async (cardId: string) => {
      if (!room) throw new Error("The tabletop is not connected yet.");
      await sendDeleteCard(room, { cardId });
    },
    [room],
  );

  const value = useMemo(
    () => ({
      cards,
      connectionError,
      spawnCard,
      claimObject,
      releaseObject,
      moveCard,
      flipCard,
      tapCard,
      untapCard,
      bringToFront,
      deleteCard,
    }),
    [
      cards,
      connectionError,
      spawnCard,
      claimObject,
      releaseObject,
      moveCard,
      flipCard,
      tapCard,
      untapCard,
      bringToFront,
      deleteCard,
    ],
  );

  return <MultiplayerContext.Provider value={value}>{children}</MultiplayerContext.Provider>;
}

export function useMultiplayer(): MultiplayerValue {
  const value = useContext(MultiplayerContext);
  if (!value) throw new Error("useMultiplayer must be used inside MultiplayerProvider.");
  return value;
}
