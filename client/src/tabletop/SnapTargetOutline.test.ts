import { describe, expect, it } from "vitest";
import type { CardInstance, CardStack } from "@card-table/shared";
import { CARD_HEIGHT, CARD_WIDTH } from "../cards/CardRenderer";
import { getSnapTargetOutline } from "./SnapTargetOutline";
import { STACK_OFFSET } from "./interactions/snap-detection";

const card: CardInstance = {
  id: "card-1",
  definitionId: "definition-1",
  face: "front",
  orientation: "upright",
  x: 100,
  y: 120,
  zIndex: 1,
};

describe("getSnapTargetOutline", () => {
  it("outlines a standalone card with four pixels of clearance", () => {
    expect(getSnapTargetOutline({ kind: "card", card })).toEqual({
      x: card.x - CARD_WIDTH / 2 - 4,
      y: card.y - CARD_HEIGHT / 2 - 4,
      width: CARD_WIDTH + 8,
      height: CARD_HEIGHT + 8,
    });
  });

  it("outlines the top card of a stack", () => {
    const stack: CardStack = {
      id: "stack-1",
      x: 100,
      y: 120,
      cardIds: ["card-1", "card-2", "card-3"],
      zIndex: 1,
    };
    const offset = 2 * STACK_OFFSET;

    expect(getSnapTargetOutline({ kind: "stack", stack })).toMatchObject({
      x: stack.x + offset - CARD_WIDTH / 2 - 4,
      y: stack.y + offset - CARD_HEIGHT / 2 - 4,
    });
  });
});
