import { useState, type FormEvent } from "react";
import { DISPLAY_NAME_MAX_LENGTH, ROOM_PASSWORD_MAX_LENGTH } from "@card-table/shared";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import "./Lobby.css";

type LobbyMode = "create" | "join";

export function Lobby() {
  const { status, invitedRoomId, connectionError, createRoom, joinRoom } = useMultiplayer();
  const [mode, setMode] = useState<LobbyMode>(invitedRoomId ? "join" : "create");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [roomCode, setRoomCode] = useState(invitedRoomId ?? "");

  const isConnecting = status === "connecting";
  const canSubmit =
    displayName.trim().length > 0 && (mode === "create" || roomCode.trim().length > 0);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || isConnecting) return;

    const request = {
      displayName: displayName.trim(),
      password: password.length > 0 ? password : undefined,
    };
    // Connection errors are surfaced through `connectionError`.
    try {
      if (mode === "create") await createRoom(request);
      else await joinRoom({ ...request, roomId: roomCode.trim() });
    } catch {
      /* already reported */
    }
  }

  return (
    <main className="lobby">
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

        <label htmlFor="lobby-display-name">Display name</label>
        <input
          id="lobby-display-name"
          value={displayName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="nickname"
          onChange={(event) => setDisplayName(event.target.value)}
        />

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

        <label htmlFor="lobby-password">
          Password {mode === "create" ? "(optional)" : "(if required)"}
        </label>
        <input
          id="lobby-password"
          type="password"
          value={password}
          maxLength={ROOM_PASSWORD_MAX_LENGTH}
          autoComplete="off"
          onChange={(event) => setPassword(event.target.value)}
        />

        <button className="lobby-submit" type="submit" disabled={!canSubmit || isConnecting}>
          {isConnecting ? "Connecting…" : mode === "create" ? "Create room" : "Join room"}
        </button>

        {connectionError && (
          <p className="lobby-error" role="alert">
            {connectionError}
          </p>
        )}
      </form>
    </main>
  );
}
