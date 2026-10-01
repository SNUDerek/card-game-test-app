import { useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import { roomJoinUrl } from "../../multiplayer/session";
import { resolveJoinUrlBase } from "../../multiplayer/endpoint";
import { useBoardImageDownload } from "../../tabletop/board-export/useBoardImageDownload";
import { playerColor } from "./player-colors";
import "./RoomHud.css";

/** Local-only room overlay: who is here and the link to share. */
export function RoomHud() {
  const {
    roomId, roomName, roomDescription, players, selfPlayerId,
    leaveRoom, endRoom, updateRoomDetails,
  } = useMultiplayer();
  const [copied, setCopied] = useState(false);
  const [dialog, setDialog] = useState<"leave" | "end" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const boardImage = useBoardImageDownload();
  const isLastPerson = !players.some((player) => player.connected && player.id !== selfPlayerId);

  // Best effort only: browsers show their own generic text and may skip it.
  useEffect(() => {
    if (!roomId || !isLastPerson) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [roomId, isLastPerson]);

  if (!roomId) return null;

  const joinUrl = roomJoinUrl(
    roomId,
    resolveJoinUrlBase(window.location.origin, window.__CARD_TABLE__),
  );

  async function copyJoinUrl() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
    } catch (cause: unknown) {
      console.warn("Could not copy the room link:", cause);
    }
  }

  function startEditing() {
    setDraftName(roomName);
    setDraftDescription(roomDescription);
    setEditing(true);
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!draftName.trim()) return;
    try {
      await updateRoomDetails({ name: draftName.trim(), description: draftDescription.trim() });
      setActionError(null);
      setEditing(false);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Could not update the room.");
    }
  }

  async function confirmEnd() {
    setDialog(null);
    try {
      await endRoom(roomId as string);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Could not end the room.");
    }
  }

  return (
    <aside className="room-hud" aria-label="Room">
      {editing ? (
        <form className="room-hud-edit" onSubmit={(event) => void saveDetails(event)}>
          <label htmlFor="room-hud-name">Room name</label>
          <input id="room-hud-name" value={draftName} maxLength={100}
            onChange={(event) => setDraftName(event.target.value)} />
          <label htmlFor="room-hud-description">Description</label>
          <textarea id="room-hud-description" rows={2} value={draftDescription} maxLength={2000}
            onChange={(event) => setDraftDescription(event.target.value)} />
          <div className="room-hud-edit-actions">
            <button type="submit" disabled={!draftName.trim()}>Save</button>
            <button type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="room-hud-title">
          <strong className="room-hud-name-title">{roomName || "Table"}</strong>
          <button type="button" onClick={startEditing}>Edit details</button>
          {roomDescription && <p className="room-hud-description">{roomDescription}</p>}
        </div>
      )}
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
            <span
              className="room-hud-swatch"
              style={{ background: playerColor(player.joinOrder) }}
              aria-hidden="true"
            />
            <span className="room-hud-name">{player.displayName}</span>
            {player.id === selfPlayerId && <span className="room-hud-tag">you</span>}
            {!player.connected && <span className="room-hud-tag">reconnecting…</span>}
          </li>
        ))}
      </ul>

      <button
        className="room-hud-action"
        type="button"
        disabled={boardImage.isExporting}
        onClick={() => void boardImage.download()}
      >
        {boardImage.isExporting ? "Preparing image…" : "Download board image"}
      </button>
      {boardImage.error && (
        <p className="room-hud-error" role="alert">
          {boardImage.error}
        </p>
      )}

      {actionError && (
        <p className="room-hud-error" role="alert">
          {actionError}
        </p>
      )}

      <button
        className="room-hud-leave"
        type="button"
        onClick={() => (isLastPerson ? setDialog("leave") : void leaveRoom())}
      >
        Leave room
      </button>
      <button className="room-hud-leave" type="button" onClick={() => setDialog("end")}>
        End room
      </button>

      {dialog === "leave" && (
        <ConfirmDialog
          title="You are the last person here"
          onCancel={() => setDialog(null)}
          actions={[
            {
              label: "Download board image",
              disabled: boardImage.isExporting,
              onClick: () => void boardImage.download(),
            },
            { label: "Leave", tone: "danger", onClick: () => void leaveRoom() },
          ]}
        >
          Leaving ends the room and discards the table, so you may want to save the board first.
        </ConfirmDialog>
      )}
      {dialog === "end" && (
        <ConfirmDialog
          title="End this room?"
          onCancel={() => setDialog(null)}
          actions={[{ label: "End room", tone: "danger", onClick: () => void confirmEnd() }]}
        >
          Everyone in the room will be disconnected and the table is discarded.
        </ConfirmDialog>
      )}
    </aside>
  );
}
