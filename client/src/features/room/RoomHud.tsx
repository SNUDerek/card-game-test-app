import { useState } from "react";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import { roomJoinUrl } from "../../multiplayer/session";
import "./RoomHud.css";

/**
 * Local-only room overlay: who is here, who is host, and the link to share.
 * Host is derived by comparing PlayerIds against the room's canonical
 * hostPlayerId — there is no per-player host flag to keep in sync.
 */
export function RoomHud() {
  const { roomId, players, hostPlayerId, selfPlayerId, leaveRoom } = useMultiplayer();
  const [copied, setCopied] = useState(false);

  if (!roomId) return null;

  const joinUrl = roomJoinUrl(roomId, window.location.origin);

  async function copyJoinUrl() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
    } catch (cause: unknown) {
      console.warn("Could not copy the room link:", cause);
    }
  }

  return (
    <aside className="room-hud" aria-label="Room">
      <div className="room-hud-header">
        <span className="room-hud-label">Room</span>
        <code className="room-hud-code">{roomId}</code>
        <button type="button" onClick={() => void copyJoinUrl()}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <ul className="room-hud-players">
        {players.map((player) => (
          <li key={player.id} className={player.connected ? undefined : "is-away"}>
            <span className="room-hud-name">{player.displayName}</span>
            {player.id === selfPlayerId && <span className="room-hud-tag">you</span>}
            {player.id === hostPlayerId && <span className="room-hud-tag is-host">host</span>}
            {!player.connected && <span className="room-hud-tag">reconnecting…</span>}
          </li>
        ))}
      </ul>

      <button className="room-hud-leave" type="button" onClick={() => void leaveRoom()}>
        Leave room
      </button>
    </aside>
  );
}
