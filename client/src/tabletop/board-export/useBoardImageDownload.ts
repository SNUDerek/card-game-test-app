import { useCallback, useState } from "react";
import { useCardCatalog } from "../../features/card-browser/CardCatalogContext";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import { boardImageFileName } from "./board-bounds";
import { BoardExportError, downloadBlob, renderBoardImage } from "./export-board-image";

export interface BoardImageDownload {
  download(): Promise<void>;
  isExporting: boolean;
  error: string | null;
}

/**
 * Downloads a PNG of the current table. Local-only: nothing is stored on the
 * server and no other player sees it happen.
 */
export function useBoardImageDownload(): BoardImageDownload {
  const { cards, stacks, roomId } = useMultiplayer();
  const { definitionsById } = useCardCatalog();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async () => {
    setIsExporting(true);
    setError(null);
    try {
      const blob = await renderBoardImage({ cards, stacks, definitionsById });
      downloadBlob(blob, boardImageFileName(roomId ?? "table", new Date()));
    } catch (cause: unknown) {
      console.error("Board image export failed:", cause);
      setError(
        cause instanceof BoardExportError ? cause.message : "The board image could not be made.",
      );
    } finally {
      setIsExporting(false);
    }
  }, [cards, stacks, definitionsById, roomId]);

  return { download, isExporting, error };
}
