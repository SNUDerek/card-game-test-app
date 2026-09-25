import { describe, expect, it } from "vitest";
import { CardInstanceState, RoomState } from "../../rooms/state/RoomState.js";
import { bringToFront, bringToFrontIfNeeded } from "./bring-to-front.js";

function addCard(state: RoomState, id: string, zIndex: number, stackId?: string) {
  state.cards.set(
    id,
    new CardInstanceState({
      id,
      definitionId: "spell-1",
      face: "front",
      orientation: "upright",
      x: 0,
      y: 0,
      stackId,
      zIndex,
    }),
  );
}

describe("bringToFront", () => {
  it("assigns one more than the current maximum z-index", () => {
    const state = new RoomState();
    addCard(state, "back", 3);
    addCard(state, "front", 8);

    expect(bringToFront(state, "back")).toBe(9);
    expect(state.cards.get("back")?.zIndex).toBe(9);
  });

  it("does not churn z-index when drag updates already target the front card", () => {
    const state = new RoomState();
    addCard(state, "back", 3);
    addCard(state, "front", 8);

    expect(bringToFrontIfNeeded(state, "front")).toBe(8);
    expect(bringToFrontIfNeeded(state, "back")).toBe(9);
  });

  it("rejects unknown and stacked cards without changing z-order", () => {
    const state = new RoomState();
    addCard(state, "stacked", 3, "stack-1");

    expect(() => bringToFront(state, "missing")).toThrow("Unknown card");
    expect(() => bringToFront(state, "stacked")).toThrow("stack");
    expect(state.cards.get("stacked")?.zIndex).toBe(3);
  });
});
