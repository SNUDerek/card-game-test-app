import { describe, expect, it } from "vitest";
import { WORLD_COORDINATE_LIMIT } from "@card-table/shared";
import { RoomState } from "../../rooms/state/RoomState.js";
import { spawnCard } from "./spawn-card.js";

describe("spawnCard", () => {
  it("creates a standalone face-up upright card at the next z-index", () => {
    const state = new RoomState();
    spawnCard(state, new Set(["spell-1"]), { definitionId: "spell-1", x: 10, y: 20 }, () =>
      "first",
    );
    const card = spawnCard(
      state,
      new Set(["spell-1"]),
      { definitionId: "spell-1", x: -30, y: 40 },
      () => "second",
    );

    expect(card.toJSON()).toEqual({
      id: "second",
      definitionId: "spell-1",
      face: "front",
      orientation: "upright",
      x: -30,
      y: 40,
      zIndex: 1,
    });
    expect(state.cards.get("second")).toBe(card);
  });

  it("rejects unknown definitions without mutating state", () => {
    const state = new RoomState();

    expect(() =>
      spawnCard(state, new Set(), { definitionId: "missing", x: 0, y: 0 }),
    ).toThrow("Unknown card definition");
    expect(state.cards.size).toBe(0);
  });

  it("rejects positions outside the world bounds without mutating state", () => {
    const state = new RoomState();

    expect(() =>
      spawnCard(state, new Set(["spell-1"]), {
        definitionId: "spell-1",
        x: WORLD_COORDINATE_LIMIT + 1,
        y: 0,
      }),
    ).toThrow("world units");
    expect(state.cards.size).toBe(0);
  });
});
