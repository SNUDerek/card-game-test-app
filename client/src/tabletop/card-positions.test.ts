import { describe, expect, it } from "vitest";
import type { CardInstance, CardStack } from "@card-table/shared";
import { resolveRenderedCardPositions } from "./card-positions";
import { STACK_OFFSET } from "./interactions/snap-detection";

function card(id: string, overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    id,
    definitionId: "d",
    face: "front",
    orientation: "upright",
    x: 100,
    y: 200,
    zIndex: 0,
    ...overrides,
  };
}

const noSources = { dragged: {}, interpolated: {}, draggedStacks: {} };

describe("resolveRenderedCardPositions", () => {
  it("falls back to the authoritative position when a card is still", () => {
    const positions = resolveRenderedCardPositions([card("card-1")], [], noSources);
    expect(positions.get("card-1")).toEqual({ x: 100, y: 200 });
  });

  it("prefers a local drag, which runs ahead of the server", () => {
    const positions = resolveRenderedCardPositions([card("card-1")], [], {
      ...noSources,
      dragged: { "card-1": { x: 300, y: 400 } },
      interpolated: { "card-1": { x: 150, y: 250 } },
    });

    expect(positions.get("card-1")).toEqual({ x: 300, y: 400 });
  });

  it("uses the interpolated position for a card someone else is moving", () => {
    const positions = resolveRenderedCardPositions([card("card-1")], [], {
      ...noSources,
      interpolated: { "card-1": { x: 150, y: 250 } },
    });

    // Not the authoritative (100, 200): this is what makes a decoration drawn
    // at the authoritative position run ahead of its card.
    expect(positions.get("card-1")).toEqual({ x: 150, y: 250 });
  });

  it("places a stacked card by its stack, not its own coordinates", () => {
    const stacked = [
      card("card-0", { stackId: "stack-1", x: 999, y: 999 }),
      card("card-1", { stackId: "stack-1", x: 999, y: 999 }),
    ];
    const stacks: CardStack[] = [
      { id: "stack-1", x: 10, y: 20, cardIds: ["card-0", "card-1"], zIndex: 0 },
    ];

    const positions = resolveRenderedCardPositions(stacked, stacks, noSources);

    expect(positions.get("card-0")).toEqual({ x: 10, y: 20 });
    expect(positions.get("card-1")).toEqual({
      x: 10 + STACK_OFFSET,
      y: 20 + STACK_OFFSET,
    });
  });

  it("follows a stack being dragged, so its members travel with it", () => {
    const stacked = [card("card-1", { stackId: "stack-1" })];
    const stacks: CardStack[] = [
      { id: "stack-1", x: 10, y: 20, cardIds: ["card-0", "card-1"], zIndex: 0 },
    ];

    const positions = resolveRenderedCardPositions(stacked, stacks, {
      ...noSources,
      draggedStacks: { "stack-1": { x: 500, y: 600 } },
    });

    expect(positions.get("card-1")).toEqual({
      x: 500 + STACK_OFFSET,
      y: 600 + STACK_OFFSET,
    });
  });

  it("does not interpolate a stacked card out of its pile", () => {
    const stacked = [card("card-1", { stackId: "stack-1" })];
    const stacks: CardStack[] = [
      { id: "stack-1", x: 10, y: 20, cardIds: ["card-1"], zIndex: 0 },
    ];

    const positions = resolveRenderedCardPositions(stacked, stacks, {
      ...noSources,
      interpolated: { "card-1": { x: 777, y: 888 } },
    });

    expect(positions.get("card-1")).toEqual({ x: 10, y: 20 });
  });
});
