import type { CardInstance, CardOrientation, CardStack } from "@card-table/shared";
import { CARD_HEIGHT, CARD_WIDTH } from "../../cards/CardRenderer";
import { STACK_OFFSET } from "../interactions/snap-detection";

/** A rectangle in world coordinates. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Room around the outermost cards, in world units; also covers card shadows. */
export const BOARD_PADDING = 40;
/** What an empty table exports as: a plain stretch of tabletop. */
export const EMPTY_BOARD: Readonly<WorldRect> = Object.freeze({
  x: 0,
  y: 0,
  width: 800,
  height: 600,
});
/** Longest side of an exported image, in pixels. Larger boards are scaled down. */
export const MAX_BOARD_IMAGE_SIDE = 4096;

function cardExtent(orientation: CardOrientation) {
  // Cards rotate about their center, so tapping swaps the footprint's sides.
  return orientation === "tapped"
    ? { halfWidth: CARD_HEIGHT / 2, halfHeight: CARD_WIDTH / 2 }
    : { halfWidth: CARD_WIDTH / 2, halfHeight: CARD_HEIGHT / 2 };
}

/**
 * The world-space area every card occupies, padded, from authoritative
 * positions. It ignores this client's pan, zoom, and in-progress drags, so
 * every player exports the same board. Card positions are card centers.
 */
export function computeBoardBounds(
  cards: readonly CardInstance[],
  stacks: readonly CardStack[],
): WorldRect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (centerX: number, centerY: number, orientation: CardOrientation) => {
    const { halfWidth, halfHeight } = cardExtent(orientation);
    minX = Math.min(minX, centerX - halfWidth);
    minY = Math.min(minY, centerY - halfHeight);
    maxX = Math.max(maxX, centerX + halfWidth);
    maxY = Math.max(maxY, centerY + halfHeight);
  };

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  for (const card of cards) {
    if (card.stackId === undefined) include(card.x, card.y, card.orientation);
  }
  for (const stack of stacks) {
    stack.cardIds.forEach((cardId, index) => {
      const card = cardsById.get(cardId);
      if (!card) return;
      // Matches Stack: each card is offset diagonally from the one below.
      include(stack.x + index * STACK_OFFSET, stack.y + index * STACK_OFFSET, card.orientation);
    });
  }

  if (minX === Infinity) return { ...EMPTY_BOARD };
  return {
    x: minX - BOARD_PADDING,
    y: minY - BOARD_PADDING,
    width: maxX - minX + BOARD_PADDING * 2,
    height: maxY - minY + BOARD_PADDING * 2,
  };
}

/** World-to-pixel scale for an export: 1:1, unless that exceeds the size cap. */
export function boardImageScale(bounds: WorldRect, maxSide = MAX_BOARD_IMAGE_SIDE): number {
  return Math.min(1, maxSide / bounds.width, maxSide / bounds.height);
}

/** e.g. `board-KM7XPQ3D-2026-10-01-1530.png`, in the viewer's local time. */
export function boardImageFileName(roomLabel: string, at: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp =
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}`;
  const label = roomLabel.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "table";
  return `board-${label}-${stamp}.png`;
}
