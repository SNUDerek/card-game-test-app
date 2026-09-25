import { describe, expect, it } from "vitest";
import type { CardInstance, CardStack } from "@card-table/shared";
import { findStackTarget, resolveStackTarget } from "./snap-detection";

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
    const cards = [card("source", 0, 0), card("a", 100, 100), card("b", 108, 108)];
    cards[1]!.stackId = "stack-1";
    cards[2]!.stackId = "stack-1";
    expect(findStackTarget("source", { x: 108, y: 108 }, cards, [stack]))
      .toEqual({ kind: "stack", stackId: "stack-1" });
  });

  it("does not preview a face-incompatible target", () => {
    const source = card("source", 0, 0);
    source.face = "back";
    expect(findStackTarget("source", { x: 100, y: 100 }, [source, card("target", 100, 100)], []))
      .toBeNull();
  });
});

describe("resolveStackTarget", () => {
  it("resolves card and stack references to live objects", () => {
    const targetCard = card("target", 100, 100);
    const stack: CardStack = { id: "stack-1", x: 50, y: 60, cardIds: ["a", "b"], zIndex: 2 };

    expect(resolveStackTarget({ kind: "card", cardId: targetCard.id }, [targetCard], [stack]))
      .toEqual({ kind: "card", card: targetCard });
    expect(resolveStackTarget({ kind: "stack", stackId: stack.id }, [targetCard], [stack]))
      .toEqual({ kind: "stack", stack });
  });

  it("returns null when the target no longer exists", () => {
    expect(resolveStackTarget({ kind: "card", cardId: "missing" }, [], [])).toBeNull();
    expect(resolveStackTarget(null, [], [])).toBeNull();
  });
});
