import type { CardInstance, CardStack } from "@card-table/shared";
import { STACK_OFFSET } from "./interactions/snap-detection";
import type { Point } from "./viewport";

export interface CardPositionSources {
  /** Cards this client is dragging: immediate, ahead of the server. */
  dragged: Record<string, Point>;
  /** Cards moved by someone else: eased toward the authoritative position. */
  interpolated: Record<string, Point>;
  /** Stacks this client is dragging, by stack id. */
  draggedStacks: Record<string, Point>;
}

/**
 * Where every card is actually drawn this frame, in world coordinates.
 *
 * A card's drawn position is not its authoritative position: a local drag runs
 * ahead of the server, remote movement is eased behind it, and a stacked card
 * is placed relative to its stack rather than by its own coordinates. Anything
 * that decorates a card -- hover outlines, the magnified preview -- has to use
 * the drawn position, or it detaches from the card during movement.
 *
 * This is the single source of that answer so the decorations cannot disagree
 * with the card, as they did when each derived its own position.
 */
export function resolveRenderedCardPositions(
  cards: CardInstance[],
  stacks: CardStack[],
  sources: CardPositionSources,
): Map<string, Point> {
  const stacksById = new Map(stacks.map((stack) => [stack.id, stack]));
  const positions = new Map<string, Point>();

  for (const card of cards) {
    const stack = card.stackId === undefined ? undefined : stacksById.get(card.stackId);

    if (stack) {
      // Stacks move as one object, so a member's position follows the stack's
      // origin plus its step in the pile.
      const origin = sources.draggedStacks[stack.id] ?? stack;
      const offset = stack.cardIds.indexOf(card.id) * STACK_OFFSET;
      positions.set(card.id, { x: origin.x + offset, y: origin.y + offset });
      continue;
    }

    positions.set(
      card.id,
      sources.dragged[card.id] ?? sources.interpolated[card.id] ?? { x: card.x, y: card.y },
    );
  }

  return positions;
}
