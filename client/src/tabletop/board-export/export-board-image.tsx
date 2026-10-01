import { createRef } from "react";
import { createRoot } from "react-dom/client";
import type Konva from "konva";
import type { CardDefinition, CardInstance, CardStack } from "@card-table/shared";
import { boardImageScale, computeBoardBounds } from "./board-bounds";
import { BoardSnapshot } from "./BoardSnapshot";

export class BoardExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardExportError";
  }
}

export interface BoardExportInput {
  cards: readonly CardInstance[];
  stacks: readonly CardStack[];
  definitionsById: ReadonlyMap<string, CardDefinition>;
}

const RENDER_TIMEOUT_MS = 5_000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    // Same as the table's loader: anonymous CORS keeps the canvas exportable.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(url));
    image.src = url;
  });
}

/** Loads the artwork of every face-up card; face-down cards draw no art. */
async function preloadArtwork({
  cards,
  definitionsById,
}: BoardExportInput): Promise<Map<string, HTMLImageElement>> {
  const urls = new Set<string>();
  for (const card of cards) {
    const definition = definitionsById.get(card.definitionId);
    if (card.face === "front" && definition) urls.add(definition.imageUrl);
  }

  const results = await Promise.allSettled(
    [...urls].map(async (url) => [url, await loadImage(url)] as const),
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed > 0) {
    throw new BoardExportError(
      `${failed} card ${failed === 1 ? "image" : "images"} could not be loaded, ` +
        "so the board image was not made. Check the connection and try again.",
    );
  }
  return new Map(
    results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
  );
}

/**
 * Renders the whole table to a PNG, independent of the viewer's pan and zoom.
 *
 * The board is drawn in a separate, offscreen Konva stage, so capturing it
 * never moves the visible table or touches shared state. All artwork is loaded
 * first; an image that fails to load fails the export rather than leaving a
 * silent gap in the picture.
 */
export async function renderBoardImage(input: BoardExportInput): Promise<Blob> {
  const images = await preloadArtwork(input);
  const bounds = computeBoardBounds(input.cards, input.stacks);
  const scale = boardImageScale(bounds);

  const container = document.createElement("div");
  const root = createRoot(container);
  const stageRef = createRef<Konva.Stage>();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new BoardExportError("The board took too long to draw.")),
        RENDER_TIMEOUT_MS,
      );
      root.render(
        <BoardSnapshot
          {...input}
          images={images}
          bounds={bounds}
          scale={scale}
          stageRef={stageRef}
          onReady={() => {
            window.clearTimeout(timer);
            resolve();
          }}
        />,
      );
    });

    const stage = stageRef.current;
    if (!stage) throw new BoardExportError("The board could not be drawn.");
    // The stage is already sized in output pixels, so capture at 1:1 rather
    // than at the screen's device pixel ratio.
    const blob = await stage.toBlob({ pixelRatio: 1, mimeType: "image/png" });
    if (!(blob instanceof Blob)) throw new BoardExportError("The board image could not be encoded.");
    return blob;
  } finally {
    root.unmount();
  }
}

/** Saves a blob through the browser's ordinary download flow. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
