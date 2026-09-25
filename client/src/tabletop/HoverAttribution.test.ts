import { describe, expect, it } from "vitest";
import type { CardInstance, CardStack, Player } from "@card-table/shared";
import { resolveHoverHighlights } from "./HoverAttribution";
import { playerColor } from "../features/room/player-colors";
import { STACK_OFFSET } from "./interactions/snap-detection";

function player(id: string, joinOrder: number, hoveredCardId?: string): Player {
  return { id, displayName: id, connected: true, joinOrder, hoveredCardId };
}

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

const cards = [card("card-1")];
const noStacks: CardStack[] = [];

describe("resolveHoverHighlights", () => {
  it("marks a card another player is hovering", () => {
    const highlights = resolveHoverHighlights(
      [player("alice", 0, "card-1")],
      cards,
      noStacks,
      "me",
    );

    expect(highlights).toEqual([
      { cardId: "card-1", displayName: "alice", color: playerColor(0), x: 100, y: 200 },
    ]);
  });

  it("never marks the local player's own hover", () => {
    const highlights = resolveHoverHighlights(
      [player("me", 0, "card-1")],
      cards,
      noStacks,
      "me",
    );

    expect(highlights).toEqual([]);
  });

  it("gives a contested card to the earliest joiner, whatever order players arrive in", () => {
    const contenders = [player("bob", 3, "card-1"), player("ann", 1, "card-1")];

    const forwards = resolveHoverHighlights(contenders, cards, noStacks, "me");
    const backwards = resolveHoverHighlights([...contenders].reverse(), cards, noStacks, "me");

    expect(forwards).toHaveLength(1);
    expect(forwards[0]!.displayName).toBe("ann");
    // Stable regardless of iteration order, so the highlight cannot flicker.
    expect(backwards).toEqual(forwards);
  });

  it("ignores hovers of cards that are gone, and of disconnected players", () => {
    expect(
      resolveHoverHighlights([player("alice", 0, "deleted-card")], cards, noStacks, "me"),
    ).toEqual([]);

    const away = { ...player("alice", 0, "card-1"), connected: false };
    expect(resolveHoverHighlights([away], cards, noStacks, "me")).toEqual([]);
  });

  it("follows a stacked card to its drawn offset rather than its own coordinates", () => {
    const stacked = [card("card-1", { stackId: "stack-1", x: 999, y: 999 })];
    const stacks: CardStack[] = [
      { id: "stack-1", x: 10, y: 20, cardIds: ["card-0", "card-1"], zIndex: 0 },
    ];

    const [highlight] = resolveHoverHighlights(
      [player("alice", 0, "card-1")],
      stacked,
      stacks,
      "me",
    );

    expect(highlight).toMatchObject({ x: 10 + STACK_OFFSET, y: 20 + STACK_OFFSET });
  });
});
