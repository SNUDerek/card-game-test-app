import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { apiRequest } from "../../api/client";
import { ConfirmDialog } from "../../components/ConfirmDialog";

const RoomSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  setName: z.string(),
  playerCount: z.number(),
  maxPlayers: z.number(),
});
const RoomListSchema = z.object({ rooms: z.array(RoomSummarySchema) });
export type RoomSummary = z.infer<typeof RoomSummarySchema>;

/** Open rooms with Join and End actions; the list is local, fetched on demand. */
export function RoomBrowser({
  disabled,
  onJoin,
  onEnd,
}: {
  disabled: boolean;
  onJoin(roomId: string): void;
  onEnd(roomId: string): Promise<void>;
}) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingEnd, setPendingEnd] = useState<RoomSummary | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRooms((await apiRequest("/api/rooms", RoomListSchema)).rooms);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not load rooms.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function confirmEnd(room: RoomSummary) {
    setPendingEnd(null);
    try {
      await onEnd(room.id);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not end the room.");
    }
    await refresh();
  }

  return (
    <section className="room-browser" aria-label="Open rooms">
      <div className="room-browser-header">
        <h2>Open rooms</h2>
        <button type="button" onClick={() => void refresh()}>Refresh</button>
      </div>
      {error && <p className="lobby-error" role="alert">{error}</p>}
      {!error && rooms.length === 0 && <p className="room-browser-empty">No open rooms.</p>}
      <ul>
        {rooms.map((room) => (
          <li key={room.id}>
            <div className="room-browser-info">
              <strong>{room.name}</strong>
              <span>{room.setName} · {room.playerCount}/{room.maxPlayers} players</span>
              {room.description && <span>{room.description}</span>}
            </div>
            <button type="button" disabled={disabled} onClick={() => onJoin(room.id)}>
              Join {room.name}
            </button>
            <button type="button" className="is-danger" onClick={() => setPendingEnd(room)}>
              End {room.name}
            </button>
          </li>
        ))}
      </ul>
      {pendingEnd && (
        <ConfirmDialog
          title={`End "${pendingEnd.name}"?`}
          onCancel={() => setPendingEnd(null)}
          actions={[{ label: "End room", tone: "danger", onClick: () => void confirmEnd(pendingEnd) }]}
        >
          Everyone in the room will be disconnected and the table is discarded.
        </ConfirmDialog>
      )}
    </section>
  );
}
