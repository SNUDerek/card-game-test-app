import { Client } from "@colyseus/sdk";
import { useLocation } from "wouter";
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
import {
  ROOM_EVENTS,
  type CardInstance,
  type CardStack,
  type CatalogChangedEvent,
  type Player,
  type PlayerId,
  type RoomEndedEvent,
  type RoomId,
  type RoomIdleWarningEvent,
  type UpdateRoomMetadataPayload,
} from "@card-table/shared";
import { z } from "zod";
import { apiRequest } from "../api/client";
import { keepRoomOpen, requestSession, updateRoomMetadata } from "./commands";
import { resolveServerEndpoint } from "./endpoint";
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
  setId: string;
  name: string;
  description?: string;
}

export interface JoinRoomRequest {
  roomId: RoomId;
}

interface MultiplayerValue extends TableCommands {
  status: ConnectionStatus;
  roomId: RoomId | null;
  /** Room id from the shared URL, present before this client has joined. */
  invitedRoomId: RoomId | null;
  selfPlayerId: PlayerId | null;
  hostPlayerId: PlayerId;
  /** The library set the joined room plays; empty when not connected. */
  setId: string;
  roomName: string;
  roomDescription: string;
  /** When the idle timeout will end the room; null unless a warning is active. */
  idleEndsAt: number | null;
  players: Player[];
  cards: CardInstance[];
  stacks: CardStack[];
  connectionError: string | null;
  createRoom(request: CreateRoomRequest): Promise<void>;
  joinRoom(request: JoinRoomRequest): Promise<void>;
  leaveRoom(): Promise<void>;
  /** Ends a room for everyone in it; works for rooms this client has not joined. */
  endRoom(roomId: RoomId): Promise<void>;
  updateRoomDetails(payload: UpdateRoomMetadataPayload): Promise<void>;
  keepOpen(): Promise<void>;
  /** Listens for library edits to the room's set. Returns an unsubscribe function. */
  subscribeCatalogChanges(listener: (event: CatalogChangedEvent) => void): () => void;
}

const MultiplayerContext = createContext<MultiplayerValue | null>(null);

function serverEndpoint(): string {
  return resolveServerEndpoint(window.location);
}

export function MultiplayerProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const client = useMemo(() => new Client(serverEndpoint()), []);
  const roomRef = useRef<TableRoom | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [roomId, setRoomId] = useState<RoomId | null>(null);
  // Only the URL the page loaded with can resume a stored seat; later
  // navigation (including our own after joining) must not reconnect.
  const [initialRoomId] = useState(() => parseRoomIdFromPath(location));
  const [invitedRoomId, setInvitedRoomId] = useState<RoomId | null>(initialRoomId);
  const [selfPlayerId, setSelfPlayerId] = useState<PlayerId | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [idleEndsAt, setIdleEndsAt] = useState<number | null>(null);
  const endedMessage = useRef<string | null>(null);
  const { players, cards, stacks, hostPlayerId, setId, roomName, roomDescription, syncRoom, resetSync } =
    useRoomSync();
  const catalogListeners = useRef(new Set<(event: CatalogChangedEvent) => void>());
  const commands = useTableCommands(roomRef);

  const resetSession = useCallback(() => {
    roomRef.current = null;
    setStatus("disconnected");
    setRoomId(null);
    setSelfPlayerId(null);
    setIdleEndsAt(null);
    resetSync();
  }, [resetSync]);

  const attachRoom = useCallback(
    (room: TableRoom) => {
      roomRef.current = room;

      syncRoom(room);
      room.onMessage(ROOM_EVENTS.CATALOG_CHANGED, (event: CatalogChangedEvent) => {
        if (roomRef.current !== room) return;
        for (const listener of catalogListeners.current) listener(event);
      });
      room.onMessage(ROOM_EVENTS.ROOM_ENDED, (event: RoomEndedEvent) => {
        if (roomRef.current === room) endedMessage.current = event.message;
      });
      room.onMessage(ROOM_EVENTS.ROOM_IDLE_WARNING, (event: RoomIdleWarningEvent) => {
        if (roomRef.current === room) setIdleEndsAt(event.endsAt);
      });
      room.onMessage(ROOM_EVENTS.ROOM_IDLE_RESUMED, () => {
        if (roomRef.current === room) setIdleEndsAt(null);
      });
      room.onLeave(() => {
        if (roomRef.current !== room) return;
        const ended = endedMessage.current;
        endedMessage.current = null;
        // The seat is gone for good by now: the SDK retries transient drops on
        // its own, and a reload would be refused the stale token anyway.
        clearStoredSession();
        setConnectionError(ended ?? "Disconnected from the tabletop server.");
        resetSession();
        navigate("/", { replace: true });
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
      navigate(roomPath(room.roomId));
    },
    [navigate, resetSession, syncRoom],
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
    (request: CreateRoomRequest) => connect(async () => {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const reservation = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((reservation as { error?: string }).error ?? "Could not create room.");
      return client.consumeSeatReservation<ClientRoomState>(reservation);
    }),
    [client, connect],
  );

  const joinRoom = useCallback(
    ({ roomId: targetRoomId }: JoinRoomRequest) =>
      connect(() => client.joinById<ClientRoomState>(targetRoomId)),
    [client, connect],
  );

  const endRoom = useCallback(async (targetRoomId: RoomId) => {
    await apiRequest(`/api/rooms/${encodeURIComponent(targetRoomId)}/end`, z.undefined(), { method: "POST" });
  }, []);

  const updateRoomDetails = useCallback(async (payload: UpdateRoomMetadataPayload) => {
    const room = roomRef.current;
    if (room) await updateRoomMetadata(room, payload);
  }, []);

  const keepOpen = useCallback(async () => {
    const room = roomRef.current;
    if (room) await keepRoomOpen(room);
    setIdleEndsAt(null);
  }, []);

  const leaveRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    clearStoredSession();
    resetSession();
    setInvitedRoomId(null);
    setConnectionError(null);
    navigate("/");
    if (room) await room.leave();
  }, [navigate, resetSession]);

  // Do not call room.leave() from an unmount cleanup. A reload must close the
  // transport without consent so the server reserves this player's seat and
  // the stored reconnection token remains usable.

  // A reload lands back on /rooms/<id> with the seat still reserved during the
  // server's grace period, so resume it before showing the lobby.
  useEffect(() => {
    const stored = readStoredSession(initialRoomId);
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
  }, [attachRoom, client, initialRoomId]);

  const subscribeCatalogChanges = useCallback(
    (listener: (event: CatalogChangedEvent) => void) => {
      catalogListeners.current.add(listener);
      return () => {
        catalogListeners.current.delete(listener);
      };
    },
    [],
  );

  const value = useMemo<MultiplayerValue>(
    () => ({
      ...commands,
      status,
      roomId,
      invitedRoomId,
      selfPlayerId,
      hostPlayerId,
      setId,
      roomName,
      roomDescription,
      idleEndsAt,
      players,
      cards,
      stacks,
      connectionError,
      createRoom,
      joinRoom,
      leaveRoom,
      endRoom,
      updateRoomDetails,
      keepOpen,
      subscribeCatalogChanges,
    }),
    [
      commands,
      status,
      roomId,
      invitedRoomId,
      selfPlayerId,
      hostPlayerId,
      setId,
      roomName,
      roomDescription,
      idleEndsAt,
      players,
      cards,
      stacks,
      connectionError,
      createRoom,
      joinRoom,
      leaveRoom,
      endRoom,
      updateRoomDetails,
      keepOpen,
      subscribeCatalogChanges,
    ],
  );

  return <MultiplayerContext.Provider value={value}>{children}</MultiplayerContext.Provider>;
}

export function useMultiplayer(): MultiplayerValue {
  const value = useContext(MultiplayerContext);
  if (!value) throw new Error("useMultiplayer must be used inside MultiplayerProvider.");
  return value;
}
