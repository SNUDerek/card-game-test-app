import { describe, expect, it } from "vitest";
import { PlayerState, RoomState } from "./state/RoomState.js";
import { assignHostIfVacant, migrateHostIfNeeded, nextHostPlayerId } from "./host.js";

function roomWith(
  players: Array<{ id: string; joinOrder: number; connected?: boolean }>,
  hostPlayerId = "",
) {
  const state = new RoomState();
  for (const { id, joinOrder, connected = true } of players) {
    state.players.set(
      id,
      new PlayerState({ id, displayName: id, connected, joinOrder }),
    );
  }
  state.hostPlayerId = hostPlayerId;
  return state;
}

describe("nextHostPlayerId", () => {
  it("picks the connected player who joined earliest", () => {
    const state = roomWith([
      { id: "late", joinOrder: 2 },
      { id: "early", joinOrder: 0 },
      { id: "middle", joinOrder: 1 },
    ]);

    expect(nextHostPlayerId(state)).toBe("early");
  });

  it("skips disconnected players", () => {
    const state = roomWith([
      { id: "away", joinOrder: 0, connected: false },
      { id: "present", joinOrder: 1 },
    ]);

    expect(nextHostPlayerId(state)).toBe("present");
  });

  it("returns no host when nobody is connected", () => {
    expect(nextHostPlayerId(roomWith([{ id: "away", joinOrder: 0, connected: false }]))).toBe("");
    expect(nextHostPlayerId(roomWith([]))).toBe("");
  });
});

describe("assignHostIfVacant", () => {
  it("promotes the first player and leaves an existing host alone", () => {
    const state = roomWith([{ id: "alice", joinOrder: 0 }]);

    assignHostIfVacant(state, "alice");
    expect(state.hostPlayerId).toBe("alice");

    assignHostIfVacant(state, "bob");
    expect(state.hostPlayerId).toBe("alice");
  });
});

describe("migrateHostIfNeeded", () => {
  it("hands the room to the next connected player when the host departs", () => {
    const state = roomWith([{ id: "bob", joinOrder: 1 }], "alice");

    migrateHostIfNeeded(state, "alice");

    expect(state.hostPlayerId).toBe("bob");
  });

  it("leaves the host alone when someone else departs", () => {
    const state = roomWith([{ id: "alice", joinOrder: 0 }], "alice");

    migrateHostIfNeeded(state, "bob");

    expect(state.hostPlayerId).toBe("alice");
  });

  it("empties the host when no connected player remains", () => {
    const state = roomWith([{ id: "away", joinOrder: 1, connected: false }], "alice");

    migrateHostIfNeeded(state, "alice");

    expect(state.hostPlayerId).toBe("");
  });
});
