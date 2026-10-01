import { useEffect, useState } from "react";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import { useBoardImageDownload } from "../../tabletop/board-export/useBoardImageDownload";
import "./RoomIdleBanner.css";

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Shown while the server warns that an inactive room is about to close. */
export function RoomIdleBanner() {
  const { idleEndsAt, keepOpen } = useMultiplayer();
  const boardImage = useBoardImageDownload();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (idleEndsAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [idleEndsAt]);

  if (idleEndsAt === null) return null;

  return (
    <div className="room-idle-banner" role="alert">
      <span>This room closes in {formatCountdown(idleEndsAt - now)} due to inactivity.</span>
      <button type="button" onClick={() => void keepOpen()}>Keep open</button>
      <button type="button" disabled={boardImage.isExporting} onClick={() => void boardImage.download()}>
        Download board image
      </button>
    </div>
  );
}
