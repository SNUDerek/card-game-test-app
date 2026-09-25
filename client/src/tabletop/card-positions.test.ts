import { describe, expect, it } from "vitest";
import type { CardInstance, CardStack } from "@card-table/shared";
import { resolveRenderedCardPositions, staleLocalDragIds } from "./card-positions";
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

describe("staleLocalDragIds", () => {
  it("keeps a local position that is still ahead of the server", () => {
    const cards = [card("card-1", { x: 100, y: 200 })];
    expect(staleLocalDragIds(cards, { "card-1": { x: 300, y: 400 } })).toEqual([]);
  });

  it("drops it once the server reports the same position", () => {
    const cards = [card("card-1", { x: 100, y: 200 })];
    expect(staleLocalDragIds(cards, { "card-1": { x: 100, y: 200 } })).toEqual(["card-1"]);
  });

  it("drops it when the card joins a stack, which now positions it", () => {
    // The drag that stacked this card ended at (300, 400); STACK_CARD files the
    // card into the stack without moving it, so its own coordinates still read
    // (100, 200) and would never meet the drop position.
    const cards = [card("card-1", { x: 100, y: 200, stackId: "stack-1" })];
    expect(staleLocalDragIds(cards, { "card-1": { x: 300, y: 400 } })).toEqual(["card-1"]);
  });

  it("drops it when the card is deleted, rather than leaking the entry", () => {
    expect(staleLocalDragIds([], { "card-1": { x: 300, y: 400 } })).toEqual(["card-1"]);
  });

  it("leaves a card drawn from a stack at the position the server chose", () => {
    // The sequence that desynced one client: drag a card onto a stack, then
    // draw it back out. Without clearing on stacking, the stale drop position
    // outranks the drawn position for whoever performed the original drag.
    const stacked = [card("card-1", { x: 100, y: 200, stackId: "stack-1" })];
    const stacks: CardStack[] = [
      { id: "stack-1", x: 10, y: 20, cardIds: ["card-0", "card-1"], zIndex: 0 },
    ];
    let dragged: Record<string, { x: number; y: number }> = {
      "card-1": { x: 300, y: 400 },
    };

    for (const id of staleLocalDragIds(stacked, dragged)) {
      const { [id]: _dropped, ...rest } = dragged;
      dragged = rest;
    }
    expect(dragged).toEqual({});

    // Drawn back out: standalone again, at the position DRAW_CARD assigned.
    const drawn = [card("card-1", { x: 70, y: 80 })];
    const positions = resolveRenderedCardPositions(drawn, stacks, {
      ...noSources,
      dragged,
    });
    expect(positions.get("card-1")).toEqual({ x: 70, y: 80 });
  });
});
