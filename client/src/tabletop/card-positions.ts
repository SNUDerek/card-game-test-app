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
/**
 * Local drag positions that no longer describe anything and must be dropped.
 *
 * A local position outranks the authoritative one, so a forgotten entry is not
 * inert -- it silently wins the moment the card is drawn back out of a stack,
 * leaving that one client showing it where the drag ended instead of where the
 * server put it.
 *
 * Matching coordinates is not enough to catch them: dropping a card onto a
 * stack sends STACK_CARD, which files the card into the stack without moving
 * it, so its authoritative coordinates keep their pre-stack values and never
 * meet the drop position.
 */
export function staleLocalDragIds(
  cards: CardInstance[],
  localPositions: Record<string, Point>,
): string[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const stale: string[] = [];

  for (const [cardId, local] of Object.entries(localPositions)) {
    const card = cardsById.get(cardId);
    // Deleted: nothing left to position.
    if (!card) {
      stale.push(cardId);
      continue;
    }
    // Stacked: the stack positions it now, whatever the drag last said.
    if (card.stackId !== undefined) {
      stale.push(cardId);
      continue;
    }
    // The server has caught up, so the local guess has nothing left to add.
    if (card.x === local.x && card.y === local.y) stale.push(cardId);
  }

  return stale;
}

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
