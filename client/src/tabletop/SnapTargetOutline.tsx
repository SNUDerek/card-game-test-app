import { Rect } from "react-konva";
import { CARD_HEIGHT, CARD_WIDTH } from "../cards/CardRenderer";
import { STACK_OFFSET, type ResolvedStackTarget } from "./interactions/snap-detection";

export function getSnapTargetOutline(target: ResolvedStackTarget) {
  const object = target.kind === "card" ? target.card : target.stack;
  const topCardOffset = target.kind === "stack"
    ? (target.stack.cardIds.length - 1) * STACK_OFFSET
    : 0;
  return {
    x: object.x + topCardOffset - CARD_WIDTH / 2 - 4,
    y: object.y + topCardOffset - CARD_HEIGHT / 2 - 4,
    width: CARD_WIDTH + 8,
    height: CARD_HEIGHT + 8,
  };
}

export function SnapTargetOutline({ target }: { target: ResolvedStackTarget }) {
  return (
    <Rect
      {...getSnapTargetOutline(target)}
      stroke="#facc15"
      strokeWidth={4}
      cornerRadius={10}
      listening={false}
    />
  );
}
