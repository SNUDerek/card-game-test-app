import { describe, expect, it } from "vitest";
import { CardInstanceState, CardStackState, ObjectLockState, RoomState } from "../../rooms/state/RoomState.js";
import { deleteCard } from "./delete-card.js";

const NOW = 5_000;

interface StateOptions {
  stackId?: string;
  lockedBy?: string;
  lockExpiresAt?: number;
}

function stateWithCard({ stackId, lockedBy, lockExpiresAt = 10_000 }: StateOptions = {}) {
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
  if (lockedBy) {
    state.locks.set(
      "card:card-1",
      new ObjectLockState({
        objectKind: "card",
        objectId: "card-1",
        playerId: lockedBy,
        expiresAt: lockExpiresAt,
      }),
    );
  }
  return state;
}

describe("deleteCard", () => {
  it("deletes an unclaimed standalone card", () => {
    const state = stateWithCard();

    deleteCard(state, "player-1", "card-1", NOW);

    expect(state.cards.has("card-1")).toBe(false);
  });

  it("deletes a card this player holds and drops its obsolete lock", () => {
    const state = stateWithCard({ lockedBy: "player-1" });

    deleteCard(state, "player-1", "card-1", NOW);

    expect(state.cards.has("card-1")).toBe(false);
    expect(state.locks.has("card:card-1")).toBe(false);
  });

  it("rejects an unknown card without mutation", () => {
    const state = stateWithCard();
    const before = state.toJSON();

    expect(() => deleteCard(state, "player-1", "missing", NOW)).toThrow("Unknown card");
    expect(state.toJSON()).toEqual(before);
  });

  it("rejects a buried stacked card without partial mutation", () => {
    const state = stateWithCard({ stackId: "stack-1" });
    state.cards.set("top", new CardInstanceState({ id: "top", definitionId: "top", face: "front", orientation: "upright", x: 0, y: 0, stackId: "stack-1", zIndex: 0 }));
    state.stacks.set("stack-1", new CardStackState({ id: "stack-1", x: 0, y: 0, cardIds: ["card-1", "top"], zIndex: 0 }));
    const before = state.toJSON();

    expect(() => deleteCard(state, "player-1", "card-1", NOW)).toThrow("stack");
    expect(state.toJSON()).toEqual(before);
  });

  it("deletes the exposed top card and collapses the remaining card", () => {
    const state = stateWithCard({ stackId: "stack-1" });
    state.cards.set("bottom", new CardInstanceState({ id: "bottom", definitionId: "bottom", face: "front", orientation: "upright", x: 0, y: 0, stackId: "stack-1", zIndex: 0 }));
    state.stacks.set("stack-1", new CardStackState({ id: "stack-1", x: 40, y: 50, cardIds: ["bottom", "card-1"], zIndex: 6 }));

    deleteCard(state, "player-1", "card-1", NOW);

    expect(state.cards.has("card-1")).toBe(false);
    expect(state.stacks.size).toBe(0);
    expect(state.cards.get("bottom")).toMatchObject({ stackId: undefined, x: 40, y: 50, zIndex: 6 });
  });

  it("rejects a card another player is holding, without mutation", () => {
    const state = stateWithCard({ lockedBy: "player-2" });
    const before = state.toJSON();

    expect(() => deleteCard(state, "player-1", "card-1", NOW)).toThrow(
      "claimed by another player",
    );
    expect(state.toJSON()).toEqual(before);
  });

  it("deletes a card whose other-player lock has already expired", () => {
    const state = stateWithCard({ lockedBy: "player-2", lockExpiresAt: NOW - 1 });

    deleteCard(state, "player-1", "card-1", NOW);

    expect(state.cards.has("card-1")).toBe(false);
    expect(state.locks.has("card:card-1")).toBe(false);
  });
});
