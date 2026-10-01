import { useState, type FormEvent } from "react";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import { useCurrentUser } from "../auth/AuthContext";
import "./Lobby.css";

type LobbyMode = "create" | "join";

export function Lobby() {
  const { status, invitedRoomId, connectionError, createRoom, joinRoom } = useMultiplayer();
  const { user, logout } = useCurrentUser();
  const [mode, setMode] = useState<LobbyMode>(invitedRoomId ? "join" : "create");
  const [roomCode, setRoomCode] = useState(invitedRoomId ?? "");

  const isConnecting = status === "connecting";
  const canSubmit = mode === "create" || roomCode.trim().length > 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || isConnecting) return;

    // Connection errors are surfaced through `connectionError`.
    try {
      if (mode === "create") await createRoom();
      else await joinRoom({ roomId: roomCode.trim() });
    } catch {
      /* already reported */
    }
  }

  return (
    <main className="lobby">
      <form className="lobby-card" onSubmit={onSubmit}>
        <h1>Card Table</h1>
        <p className="lobby-account">Signed in as {user?.displayName}</p>

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

        {mode === "join" && (
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

        <button className="lobby-sign-out" type="button" onClick={() => void logout()}>Sign out</button>

        {connectionError && (
          <p className="lobby-error" role="alert">
            {connectionError}
          </p>
        )}
      </form>
    </main>
  );
}
