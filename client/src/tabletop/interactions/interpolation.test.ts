import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CardInstance } from "@card-table/shared";
import { interpolatePosition, useInterpolatedCardPositions } from "./interpolation";

function card(id: string, x: number, y: number): CardInstance {
  return {
    id,
    definitionId: "spell-001",
    face: "front",
    orientation: "upright",
    x,
    y,
    zIndex: 0,
  };
}

describe("remote movement interpolation", () => {
  it("interpolates and clamps between authoritative positions", () => {
    expect(interpolatePosition({ x: 0, y: 20 }, { x: 100, y: 60 }, 0.5)).toEqual({
      x: 50,
      y: 40,
    });
    expect(interpolatePosition({ x: 0, y: 20 }, { x: 100, y: 60 }, -1)).toEqual({
      x: 0,
      y: 20,
    });
    expect(interpolatePosition({ x: 0, y: 20 }, { x: 100, y: 60 }, 2)).toEqual({
      x: 100,
      y: 60,
    });
  });
});

describe("useInterpolatedCardPositions", () => {
  it("animates a remote card from where it was drawn, not from its new position", () => {
    const { result, rerender } = renderHook(
      ({ cards }) => useInterpolatedCardPositions(cards),
      { initialProps: { cards: [card("c1", 0, 0)] } },
    );

    rerender({ cards: [card("c1", 100, 100)] });

    // Still at the old position: the jump to (100, 100) is what gets smoothed.
    expect(result.current.c1).toEqual({ x: 0, y: 0 });
  });

  it("pins a locally dragged card to its authoritative position", () => {
    const dragged = new Set(["c1"]);
    const { result, rerender } = renderHook(
      ({ cards }) => useInterpolatedCardPositions(cards, dragged),
      { initialProps: { cards: [card("c1", 0, 0)] } },
    );

    rerender({ cards: [card("c1", 100, 100)] });

    // No animation is left in flight, so releasing the card cannot snap it
    // back to (0, 0) before sliding forward again.
    expect(result.current.c1).toEqual({ x: 100, y: 100 });
  });
});
