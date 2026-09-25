import { describe, expect, it } from "vitest";
import type { CardInstance, CardStack } from "@card-table/shared";
import { findStackTarget } from "./snap-detection";

const card = (id: string, x: number, y: number): CardInstance => ({
  id, definitionId: id, face: "front", orientation: "upright", x, y, zIndex: 0,
});

describe("findStackTarget", () => {
  it("detects another standalone card and ignores the source", () => {
    const cards = [card("source", 10, 10), card("target", 100, 100)];
    expect(findStackTarget("source", { x: 100, y: 100 }, cards, [])).toEqual({
      kind: "card", cardId: "target",
    });
  });

  it("prefers an explicit stack target", () => {
    const stack: CardStack = { id: "stack-1", x: 100, y: 100, cardIds: ["a", "b"], zIndex: 2 };
    expect(findStackTarget("source", { x: 108, y: 108 }, [card("target", 108, 108)], [stack]))
      .toEqual({ kind: "stack", stackId: "stack-1" });
  });
});
