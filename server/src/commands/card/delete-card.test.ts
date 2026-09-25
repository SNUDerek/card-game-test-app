import { describe, expect, it } from "vitest";
import { CardInstanceState, ObjectLockState, RoomState } from "../../rooms/state/RoomState.js";
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

  it("rejects a stacked card without partial mutation", () => {
    const state = stateWithCard({ stackId: "stack-1" });
    const before = state.toJSON();

    expect(() => deleteCard(state, "player-1", "card-1", NOW)).toThrow("stack");
    expect(state.toJSON()).toEqual(before);
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
