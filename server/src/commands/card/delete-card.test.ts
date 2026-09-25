import { describe, expect, it } from "vitest";
import { CardInstanceState, ObjectLockState, RoomState } from "../../rooms/state/RoomState.js";
import { deleteCard } from "./delete-card.js";

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
      zIndex: 3,
    }),
  );
  state.locks.set(
    "card:card-1",
    new ObjectLockState({
      objectKind: "card",
      objectId: "card-1",
      playerId: "player-1",
      expiresAt: 10_000,
    }),
  );
  return state;
}

describe("deleteCard", () => {
  it("deletes a standalone card and its obsolete lock", () => {
    const state = stateWithCard();

    deleteCard(state, "card-1");

    expect(state.cards.has("card-1")).toBe(false);
    expect(state.locks.has("card:card-1")).toBe(false);
  });

  it("rejects an unknown card without mutation", () => {
    const state = stateWithCard();
    const before = state.toJSON();

    expect(() => deleteCard(state, "missing")).toThrow("Unknown card");
    expect(state.toJSON()).toEqual(before);
  });

  it("rejects a stacked card without partial mutation", () => {
    const state = stateWithCard("stack-1");
    const before = state.toJSON();

    expect(() => deleteCard(state, "card-1")).toThrow("stack");
    expect(state.toJSON()).toEqual(before);
  });
});
