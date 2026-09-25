import { Client } from "@colyseus/sdk";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CardInstance,
  CardStack,
  Player,
  PlayerId,
  RoomId,
} from "@card-table/shared";
import { requestSession } from "./commands";
import type { ClientRoomState, TableRoom } from "./room";
import { useRoomSync } from "./useRoomSync";
import { useTableCommands, type TableCommands } from "./useTableCommands";
import {
  clearStoredSession,
  describeConnectionError,
  parseRoomIdFromPath,
  readStoredSession,
  roomPath,
  storeSession,
} from "./session";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface CreateRoomRequest {
  displayName: string;
  password?: string;
}

export interface JoinRoomRequest extends CreateRoomRequest {
  roomId: RoomId;
}

interface MultiplayerValue extends TableCommands {
  status: ConnectionStatus;
  roomId: RoomId | null;
  /** Room id from the shared URL, present before this client has joined. */
  invitedRoomId: RoomId | null;
  selfPlayerId: PlayerId | null;
  hostPlayerId: PlayerId;
  players: Player[];
  cards: CardInstance[];
  stacks: CardStack[];
  connectionError: string | null;
  createRoom(request: CreateRoomRequest): Promise<void>;
  joinRoom(request: JoinRoomRequest): Promise<void>;
  leaveRoom(): Promise<void>;
}

const MultiplayerContext = createContext<MultiplayerValue | null>(null);

function serverEndpoint(): string {
  if (import.meta.env.VITE_COLYSEUS_URL) return import.meta.env.VITE_COLYSEUS_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:2567`;
}

export function MultiplayerProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => new Client(serverEndpoint()), []);
  const roomRef = useRef<TableRoom | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [roomId, setRoomId] = useState<RoomId | null>(null);
  const [invitedRoomId, setInvitedRoomId] = useState<RoomId | null>(() =>
    parseRoomIdFromPath(window.location.pathname),
  );
  const [selfPlayerId, setSelfPlayerId] = useState<PlayerId | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const { players, cards, stacks, hostPlayerId, syncRoom, resetSync } = useRoomSync();
  const commands = useTableCommands(roomRef);

  const resetSession = useCallback(() => {
    roomRef.current = null;
    setStatus("disconnected");
    setRoomId(null);
    setSelfPlayerId(null);
    resetSync();
  }, [resetSync]);

  const attachRoom = useCallback(
    (room: TableRoom) => {
      roomRef.current = room;

      syncRoom(room);
      room.onLeave(() => {
        if (roomRef.current !== room) return;
        // The seat is gone for good by now: the SDK retries transient drops on
        // its own, and a reload would be refused the stale token anyway.
        clearStoredSession();
        setConnectionError("Disconnected from the tabletop server.");
        resetSession();
      });

      // PlayerIds are server-generated, so ask which player this connection is.
      void requestSession(room)
        .then(({ playerId }) => {
          if (roomRef.current === room) setSelfPlayerId(playerId);
        })
        .catch((cause: unknown) => {
          console.warn("Could not resolve this player's identity:", cause);
        });

      setRoomId(room.roomId);
      setInvitedRoomId(room.roomId);
      setStatus("connected");
      setConnectionError(null);
      storeSession({ roomId: room.roomId, reconnectionToken: room.reconnectionToken });
      window.history.pushState({}, "", roomPath(room.roomId));
    },
    [resetSession, syncRoom],
  );

  const connect = useCallback(
    async (open: () => Promise<TableRoom>) => {
      setStatus("connecting");
      setConnectionError(null);
      try {
        attachRoom(await open());
      } catch (cause) {
        console.error("Failed to connect to tabletop room:", cause);
        setConnectionError(describeConnectionError(cause));
        resetSession();
        throw cause;
      }
    },
    [attachRoom, resetSession],
  );

  const createRoom = useCallback(
    ({ displayName, password }: CreateRoomRequest) =>
      connect(() => client.create<ClientRoomState>("table", { displayName, password })),
    [client, connect],
  );

  const joinRoom = useCallback(
    ({ roomId: targetRoomId, displayName, password }: JoinRoomRequest) =>
      connect(() =>
        client.joinById<ClientRoomState>(targetRoomId, { displayName, password }),
      ),
    [client, connect],
  );

  const leaveRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    clearStoredSession();
    resetSession();
    setInvitedRoomId(null);
    setConnectionError(null);
    window.history.pushState({}, "", "/");
    if (room) await room.leave();
  }, [resetSession]);

  // Do not call room.leave() from an unmount cleanup. A reload must close the
  // transport without consent so the server reserves this player's seat and
  // the stored reconnection token remains usable.

  // A reload lands back on /room/<id> with the seat still reserved during the
  // server's grace period, so resume it before showing the lobby.
  useEffect(() => {
    const stored = readStoredSession(parseRoomIdFromPath(window.location.pathname));
    if (!stored) return;

    let active = true;
    setStatus("connecting");
    void client
      .reconnect<ClientRoomState>(stored.reconnectionToken)
      .then((room) => {
        if (!active) {
          void room.leave();
          return;
        }
        attachRoom(room);
      })
      .catch(() => {
        if (!active) return;
        clearStoredSession();
        setStatus("disconnected");
      });

    return () => {
      active = false;
    };
  }, [attachRoom, client]);

  const value = useMemo<MultiplayerValue>(
    () => ({
      ...commands,
      status,
      roomId,
      invitedRoomId,
      selfPlayerId,
      hostPlayerId,
      players,
      cards,
      stacks,
      connectionError,
      createRoom,
      joinRoom,
      leaveRoom,
    }),
    [
      commands,
      status,
      roomId,
      invitedRoomId,
      selfPlayerId,
      hostPlayerId,
      players,
      cards,
      stacks,
      connectionError,
      createRoom,
      joinRoom,
      leaveRoom,
    ],
  );

  return <MultiplayerContext.Provider value={value}>{children}</MultiplayerContext.Provider>;
}

export function useMultiplayer(): MultiplayerValue {
  const value = useContext(MultiplayerContext);
  if (!value) throw new Error("useMultiplayer must be used inside MultiplayerProvider.");
  return value;
}
