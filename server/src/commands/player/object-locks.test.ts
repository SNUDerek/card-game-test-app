import { describe, expect, it } from "vitest";
import { CardInstanceState, RoomState } from "../../rooms/state/RoomState.js";
import {
  claimObject,
  releaseExpiredLocks,
  releaseObject,
  releasePlayerLocks,
} from "./object-locks.js";

function stateWithCard() {
  const state = new RoomState();
  state.cards.set(
    "card-1",
    new CardInstanceState({
      id: "card-1",
      definitionId: "spell-1",
      face: "front",
      orientation: "upright",
      x: 0,
      y: 0,
      zIndex: 0,
    }),
  );
  return state;
}

const object = { kind: "card", id: "card-1" } as const;

describe("object locks", () => {
  it("claims and idempotently refreshes an object for its owner", () => {
    const state = stateWithCard();
    claimObject(state, "alice", object, 100, 50);
    const refreshed = claimObject(state, "alice", object, 125, 50);

    expect(state.locks.size).toBe(1);
    expect(refreshed.toJSON()).toEqual({
      objectKind: "card",
      objectId: "card-1",
      playerId: "alice",
      expiresAt: 175,
    });
  });

  it("rejects another player without changing the active lock", () => {
    const state = stateWithCard();
    claimObject(state, "alice", object, 100, 50);

    expect(() => claimObject(state, "bob", object, 125, 50)).toThrow("another player");
    expect(state.locks.get("card:card-1")?.playerId).toBe("alice");
    expect(() => releaseObject(state, "bob", object)).toThrow("another player");
    expect(state.locks.size).toBe(1);
  });

  it("allows takeover after expiry and supports explicit release", () => {
    const state = stateWithCard();
    claimObject(state, "alice", object, 100, 50);
    claimObject(state, "bob", object, 150, 50);
    releaseObject(state, "bob", object);

    expect(state.locks.size).toBe(0);
  });

  it("releases locks on timeout and player disconnect", () => {
    const state = stateWithCard();
    claimObject(state, "alice", object, 100, 50);
    releaseExpiredLocks(state, 149);
    expect(state.locks.size).toBe(1);
    releaseExpiredLocks(state, 150);
    expect(state.locks.size).toBe(0);

    claimObject(state, "alice", object, 200, 50);
    releasePlayerLocks(state, "alice");
    expect(state.locks.size).toBe(0);
  });

  it("rejects unknown objects", () => {
    expect(() =>
      claimObject(new RoomState(), "alice", { kind: "card", id: "missing" }, 0, 50),
    ).toThrow("Unknown card");
  });
});
