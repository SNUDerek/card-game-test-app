import { describe, expect, it } from "vitest";
import type { CardInstance, CardStack } from "@card-table/shared";
import { CARD_HEIGHT, CARD_WIDTH } from "../../cards/CardRenderer";
import { STACK_OFFSET } from "../interactions/snap-detection";
import {
  BOARD_PADDING,
  EMPTY_BOARD,
  boardImageFileName,
  boardImageScale,
  computeBoardBounds,
} from "./board-bounds";

function card(overrides: Partial<CardInstance> & { id: string }): CardInstance {
  return {
    definitionId: "spell-1",
    face: "front",
    orientation: "upright",
    x: 0,
    y: 0,
    zIndex: 0,
    ...overrides,
  };
}

describe("computeBoardBounds", () => {
  it("is a blank default board when the table is empty", () => {
    expect(computeBoardBounds([], [])).toEqual(EMPTY_BOARD);
  });

  it("fits standalone cards by their centers, with padding", () => {
    const bounds = computeBoardBounds(
      [card({ id: "a", x: 0, y: 0 }), card({ id: "b", x: 500, y: 100 })],
      [],
    );
    expect(bounds).toEqual({
      x: -CARD_WIDTH / 2 - BOARD_PADDING,
      y: -CARD_HEIGHT / 2 - BOARD_PADDING,
      width: 500 + CARD_WIDTH + BOARD_PADDING * 2,
      height: 100 + CARD_HEIGHT + BOARD_PADDING * 2,
    });
  });

  it("swaps a tapped card's footprint", () => {
    const bounds = computeBoardBounds([card({ id: "a", orientation: "tapped" })], []);
    expect(bounds.width).toBe(CARD_HEIGHT + BOARD_PADDING * 2);
    expect(bounds.height).toBe(CARD_WIDTH + BOARD_PADDING * 2);
  });

  it("includes every card of a stack at its diagonal offset", () => {
    const stack: CardStack = { id: "s", x: 0, y: 0, cardIds: ["a", "b", "c"], zIndex: 1 };
    const bounds = computeBoardBounds(
      [
        card({ id: "a", stackId: "s", x: 999, y: 999 }),
        card({ id: "b", stackId: "s" }),
        card({ id: "c", stackId: "s" }),
      ],
      [stack],
    );
    // The stored coordinates of stacked cards are ignored; the stack places them.
    expect(bounds.width).toBe(CARD_WIDTH + 2 * STACK_OFFSET + BOARD_PADDING * 2);
    expect(bounds.height).toBe(CARD_HEIGHT + 2 * STACK_OFFSET + BOARD_PADDING * 2);
  });
});

describe("boardImageScale", () => {
  it("keeps small boards at 1:1 and shrinks oversized ones to fit", () => {
    expect(boardImageScale({ x: 0, y: 0, width: 1000, height: 800 })).toBe(1);
    expect(boardImageScale({ x: 0, y: 0, width: 8192, height: 100 })).toBe(0.5);
    expect(boardImageScale({ x: 0, y: 0, width: 100, height: 4000 }, 1000)).toBe(0.25);
  });
});

describe("boardImageFileName", () => {
  it("names the file after the room and local time", () => {
    expect(boardImageFileName("KM7XPQ3D", new Date(2026, 9, 1, 15, 30))).toBe(
      "board-KM7XPQ3D-2026-10-01-1530.png",
    );
  });

  it("keeps room labels filename-safe", () => {
    expect(boardImageFileName("Friday / test #2", new Date(2026, 0, 2, 3, 4))).toBe(
      "board-Friday-test-2-2026-01-02-0304.png",
    );
    expect(boardImageFileName("///", new Date(2026, 0, 2, 3, 4))).toBe(
      "board-table-2026-01-02-0304.png",
    );
  });
});
