import { useEffect, useState, type FormEvent } from "react";
import { CardSetSummarySchema, type CardSetSummary } from "@card-table/shared";
import { z } from "zod";
import { Link } from "wouter";
import { apiRequest } from "../../api/client";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import { useCurrentUser } from "../auth/AuthContext";
import { RoomBrowser } from "./RoomBrowser";
import "./Lobby.css";

type LobbyMode = "create" | "join";

export function Lobby() {
  const { status, invitedRoomId, connectionError, createRoom, joinRoom, endRoom } = useMultiplayer();
  const { user, logout } = useCurrentUser();
  const [mode, setMode] = useState<LobbyMode>(invitedRoomId ? "join" : "create");
  const [roomCode, setRoomCode] = useState(invitedRoomId ?? "");
  const [sets, setSets] = useState<CardSetSummary[]>([]);
  const [setId, setSetId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [setsError, setSetsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest("/api/sets", z.object({ sets: z.array(CardSetSummarySchema) })).then((body) => {
      if (!active) return;
      setSets(body.sets);
      setSetId((current) => current || body.sets[0]?.id || "");
      setSetsError(null);
    }).catch((cause: unknown) => {
      if (!active) return;
      setSetsError(cause instanceof Error ? cause.message : "Could not load sets.");
    });
    return () => { active = false; };
  }, []);

  const isConnecting = status === "connecting";
  const canSubmit = mode === "create"
    ? setId.length > 0 && roomName.trim().length > 0
    : roomCode.trim().length > 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || isConnecting) return;

    // Connection errors are surfaced through `connectionError`.
    try {
      if (mode === "create") await createRoom({
        setId,
        name: roomName.trim(),
        ...(roomDescription.trim() && { description: roomDescription.trim() }),
      });
      else await joinRoom({ roomId: roomCode.trim() });
    } catch {
      /* already reported */
    }
  }

  return (
    <main className="lobby">
      <header className="lobby-header">
        <p className="lobby-account">Signed in as <strong>{user?.displayName}</strong></p>
        <nav aria-label="Workspace actions">
          <Link className="lobby-button" href="/sets">Card sets</Link>
          <button className="lobby-sign-out" type="button" onClick={() => void logout()}>Sign out</button>
        </nav>
      </header>
      <div className="lobby-content">
        <form className="lobby-card" onSubmit={onSubmit}>
          <h1>Card Table</h1>

        <div className="lobby-modes" role="group" aria-label="Room action">
          <button
            type="button"
            className={mode === "create" ? "is-selected" : undefined}
            aria-pressed={mode === "create"}
            onClick={() => setMode("create")}
          >
            Create
          </button>
          <button
            type="button"
            className={mode === "join" ? "is-selected" : undefined}
            aria-pressed={mode === "join"}
            onClick={() => setMode("join")}
          >
            Join
          </button>
        </div>

        {mode === "create" ? (
          <>
            <label htmlFor="lobby-set">Card set</label>
            <select id="lobby-set" value={setId} onChange={(event) => setSetId(event.target.value)}>
              {sets.length === 0 && <option value="">No sets available</option>}
              {sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
            </select>
            {sets.length === 0 && !setsError && (
              <p className="lobby-empty-hint">Create a <Link href="/sets">card set</Link> before opening a room.</p>
            )}
            <label htmlFor="lobby-room-name">Room name</label>
            <input id="lobby-room-name" value={roomName} maxLength={100}
              onChange={(event) => setRoomName(event.target.value)} />
            <label htmlFor="lobby-room-description">Description (optional)</label>
            <textarea id="lobby-room-description" value={roomDescription} rows={2} maxLength={2000}
              onChange={(event) => setRoomDescription(event.target.value)} />
          </>
        ) : (
          <>
            <label htmlFor="lobby-room-code">Room code</label>
            <input
              id="lobby-room-code"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
            />
          </>
        )}

        <button className="lobby-submit" type="submit" disabled={!canSubmit || isConnecting}>
          {isConnecting ? "Connecting…" : mode === "create" ? "Create room" : "Join room"}
        </button>

        {connectionError && (
          <p className="lobby-error" role="alert">
            {connectionError}
          </p>
        )}
        {setsError && <p className="lobby-error" role="alert">{setsError}</p>}
        </form>
        <RoomBrowser
          disabled={isConnecting}
          onJoin={(roomId) => void joinRoom({ roomId }).catch(() => undefined)}
          onEnd={endRoom}
        />
      </div>
    </main>
  );
}
