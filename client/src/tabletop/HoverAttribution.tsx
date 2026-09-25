import { Group, Rect, Text } from "react-konva";
import type {
  CardInstance,
  CardOrientation,
  CardStack,
  Player,
  PlayerId,
} from "@card-table/shared";
import { CARD_HEIGHT, CARD_WIDTH } from "../cards/CardRenderer";
import { playerColor } from "../features/room/player-colors";
import { getCardTransform } from "./Card";
import { STACK_OFFSET } from "./interactions/snap-detection";

export interface HoverHighlight {
  cardId: string;
  displayName: string;
  color: string;
  /** Card centre in world coordinates. */
  x: number;
  y: number;
  orientation: CardOrientation;
}

const LABEL_HEIGHT = 22;
const LABEL_GAP = 6;
const OUTLINE_INSET = 4;

/**
 * Footprint a card occupies on the table once tapped cards are accounted for.
 *
 * A tapped card is drawn rotated a quarter turn, so it covers the table
 * sideways: its width and height swap. The label is placed against this box so
 * it clears the card in either orientation.
 */
export function getHighlightFootprint(orientation: CardOrientation) {
  const tapped = orientation === "tapped";
  return {
    width: tapped ? CARD_HEIGHT : CARD_WIDTH,
    height: tapped ? CARD_WIDTH : CARD_HEIGHT,
  };
}

/**
 * Resolves who is hovering what into one highlight per card.
 *
 * Several players may hover the same card. Rather than stacking labels, the
 * earliest joiner wins: `joinOrder` is stable and server-assigned, so every
 * client picks the same player and the highlight does not flicker between them
 * as unrelated patches arrive.
 *
 * The local player is excluded — they can see their own pointer.
 */
export function resolveHoverHighlights(
  players: Player[],
  cards: CardInstance[],
  stacks: CardStack[],
  selfPlayerId: PlayerId | null,
): HoverHighlight[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const stacksById = new Map(stacks.map((stack) => [stack.id, stack]));
  const byCard = new Map<string, Player>();

  for (const player of players) {
    if (!player.hoveredCardId || !player.connected) continue;
    if (player.id === selfPlayerId) continue;
    if (!cardsById.has(player.hoveredCardId)) continue; // deleted, or not synced yet

    const held = byCard.get(player.hoveredCardId);
    if (!held || player.joinOrder < held.joinOrder) byCard.set(player.hoveredCardId, player);
  }

  return [...byCard].map(([cardId, player]) => {
    const card = cardsById.get(cardId)!;
    // A card in a stack is drawn at a stepped offset from the stack origin, not
    // at its own coordinates, so the highlight has to follow the same rule.
    const stack = card.stackId ? stacksById.get(card.stackId) : undefined;
    const index = stack ? stack.cardIds.indexOf(card.id) : 0;
    const offset = index * STACK_OFFSET;

    return {
      cardId,
      displayName: player.displayName,
      color: playerColor(player.joinOrder),
      x: stack ? stack.x + offset : card.x,
      y: stack ? stack.y + offset : card.y,
      orientation: card.orientation,
    };
  });
}

/** Non-interactive: presence must never intercept a pointer. */
export function HoverAttribution({ highlight }: { highlight: HoverHighlight }) {
  // Same transform the card itself uses, so the outline turns with a tapped
  // card instead of boxing it off-axis.
  const transform = getCardTransform(highlight.orientation);
  const footprint = getHighlightFootprint(highlight.orientation);
  const labelLeft = highlight.x - footprint.width / 2;
  const labelTop =
    highlight.y - footprint.height / 2 - OUTLINE_INSET - LABEL_GAP - LABEL_HEIGHT;

  return (
    <Group listening={false}>
      <Group
        x={highlight.x}
        y={highlight.y}
        rotation={transform.rotation}
        offsetX={transform.offsetX}
        offsetY={transform.offsetY}
      >
        <Rect
          x={-OUTLINE_INSET}
          y={-OUTLINE_INSET}
          width={CARD_WIDTH + OUTLINE_INSET * 2}
          height={CARD_HEIGHT + OUTLINE_INSET * 2}
          stroke={highlight.color}
          strokeWidth={5}
          cornerRadius={10}
        />
      </Group>

      {/* Deliberately outside the rotated group: the name stays upright and
          readable however the card it belongs to is turned. */}
      <Group x={labelLeft} y={labelTop}>
        <Rect
          width={footprint.width}
          height={LABEL_HEIGHT}
          fill={highlight.color}
          cornerRadius={6}
        />
        <Text
          text={highlight.displayName}
          width={footprint.width}
          height={LABEL_HEIGHT}
          align="center"
          verticalAlign="middle"
          fontSize={13}
          fontStyle="bold"
          fill="#0f172a"
          ellipsis
          wrap="none"
          padding={4}
        />
      </Group>
    </Group>
  );
}
