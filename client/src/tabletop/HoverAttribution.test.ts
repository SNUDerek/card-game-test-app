import { describe, expect, it } from "vitest";
import type { CardInstance, Player } from "@card-table/shared";
import { getHighlightFootprint, resolveHoverHighlights } from "./HoverAttribution";
import { playerColor } from "../features/room/player-colors";
import { CARD_HEIGHT, CARD_WIDTH } from "../cards/CardRenderer";

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
/** Where the cards above are drawn; the highlight must follow this, not card.x. */
const positions = new Map([["card-1", { x: 100, y: 200 }]]);

describe("resolveHoverHighlights", () => {
  it("marks a card another player is hovering", () => {
    const highlights = resolveHoverHighlights(
      [player("alice", 0, "card-1")],
      cards,
      positions,
      "me",
    );

    expect(highlights).toEqual([
      {
        cardId: "card-1",
        displayName: "alice",
        color: playerColor(0),
        x: 100,
        y: 200,
        orientation: "upright",
      },
    ]);
  });

  it("carries the card's orientation, so the outline can turn with it", () => {
    const tapped = [card("card-1", { orientation: "tapped" })];
    const [highlight] = resolveHoverHighlights(
      [player("alice", 0, "card-1")],
      tapped,
      positions,
      "me",
    );

    expect(highlight!.orientation).toBe("tapped");
  });

  it("never marks the local player's own hover", () => {
    const highlights = resolveHoverHighlights(
      [player("me", 0, "card-1")],
      cards,
      positions,
      "me",
    );

    expect(highlights).toEqual([]);
  });

  it("gives a contested card to the earliest joiner, whatever order players arrive in", () => {
    const contenders = [player("bob", 3, "card-1"), player("ann", 1, "card-1")];

    const forwards = resolveHoverHighlights(contenders, cards, positions, "me");
    const backwards = resolveHoverHighlights([...contenders].reverse(), cards, positions, "me");

    expect(forwards).toHaveLength(1);
    expect(forwards[0]!.displayName).toBe("ann");
    // Stable regardless of iteration order, so the highlight cannot flicker.
    expect(backwards).toEqual(forwards);
  });

  it("ignores hovers of cards that are gone, and of disconnected players", () => {
    expect(
      resolveHoverHighlights([player("alice", 0, "deleted-card")], cards, positions, "me"),
    ).toEqual([]);

    const away = { ...player("alice", 0, "card-1"), connected: false };
    expect(resolveHoverHighlights([away], cards, positions, "me")).toEqual([]);
  });

  it("uses the drawn position, not the card's authoritative coordinates", () => {
    // A card mid-flight: the server says 999, but it is drawn part-way there.
    const moving = [card("card-1", { x: 999, y: 999 })];
    const drawn = new Map([["card-1", { x: 140, y: 240 }]]);

    const [highlight] = resolveHoverHighlights(
      [player("alice", 0, "card-1")],
      moving,
      drawn,
      "me",
    );

    expect(highlight).toMatchObject({ x: 140, y: 240 });
  });

  it("skips a card that has no drawn position yet", () => {
    expect(
      resolveHoverHighlights([player("alice", 0, "card-1")], cards, new Map(), "me"),
    ).toEqual([]);
  });
});

describe("getHighlightFootprint", () => {
  it("matches the card's own footprint when upright", () => {
    expect(getHighlightFootprint("upright")).toEqual({
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    });
  });

  it("swaps the axes for a tapped card, which is drawn a quarter turn over", () => {
    expect(getHighlightFootprint("tapped")).toEqual({
      width: CARD_HEIGHT,
      height: CARD_WIDTH,
    });
  });
});
