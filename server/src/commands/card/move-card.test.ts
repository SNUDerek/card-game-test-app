import { describe, expect, it } from "vitest";
import { WORLD_COORDINATE_LIMIT } from "@card-table/shared";
import { claimObject } from "../player/object-locks.js";
import { CardInstanceState, RoomState } from "../../rooms/state/RoomState.js";
import { moveCard } from "./move-card.js";

function stateWithCard(stackId?: string) {
  const state = new RoomState();
  state.cards.set(
    "card-1",
    new CardInstanceState({
      id: "card-1",
      definitionId: "spell-1",
      face: "front",
      orientation: "upright",
      x: 10,
      y: 20,
      stackId,
      zIndex: 0,
    }),
  );
  return state;
}

describe("moveCard", () => {
  it("moves a claimed standalone card and refreshes its lock", () => {
    const state = stateWithCard();
    claimObject(state, "alice", { kind: "card", id: "card-1" }, 100, 50);

    moveCard(state, "alice", { cardId: "card-1", x: 30, y: 40 }, 125, 50);

    expect(state.cards.get("card-1")).toMatchObject({ x: 30, y: 40 });
    expect(state.locks.get("card:card-1")?.expiresAt).toBe(175);
  });

  it("rejects missing, expired, or differently-owned locks without moving", () => {
    const unlocked = stateWithCard();
    expect(() =>
      moveCard(unlocked, "alice", { cardId: "card-1", x: 30, y: 40 }, 100, 50),
    ).toThrow("must be claimed");

    const claimed = stateWithCard();
    claimObject(claimed, "alice", { kind: "card", id: "card-1" }, 100, 50);
    expect(() =>
      moveCard(claimed, "bob", { cardId: "card-1", x: 30, y: 40 }, 125, 50),
    ).toThrow("must be claimed");
    expect(() =>
      moveCard(claimed, "alice", { cardId: "card-1", x: 30, y: 40 }, 150, 50),
    ).toThrow("must be claimed");
    expect(claimed.cards.get("card-1")).toMatchObject({ x: 10, y: 20 });
  });

  it("rejects stacked cards and out-of-bounds positions", () => {
    const stacked = stateWithCard("stack-1");
    claimObject(stacked, "alice", { kind: "card", id: "card-1" }, 100, 50);
    expect(() =>
      moveCard(stacked, "alice", { cardId: "card-1", x: 30, y: 40 }, 125, 50),
    ).toThrow("stack");

    const bounded = stateWithCard();
    claimObject(bounded, "alice", { kind: "card", id: "card-1" }, 100, 50);
    expect(() =>
      moveCard(
        bounded,
        "alice",
        { cardId: "card-1", x: WORLD_COORDINATE_LIMIT + 1, y: 0 },
        125,
        50,
      ),
    ).toThrow("world units");
  });
});
