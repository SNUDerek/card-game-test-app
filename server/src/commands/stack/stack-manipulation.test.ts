import { describe, expect, it } from "vitest";
import { CardInstanceState, CardStackState, ObjectLockState, RoomState } from "../../rooms/state/RoomState.js";
import { moveStack } from "./move-stack.js";
import { drawTopCard } from "./draw-top-card.js";
import { deleteStack } from "./delete-stack.js";

function stateWithStack(size = 3) {
  const state = new RoomState();
  const ids = Array.from({ length: size }, (_, i) => `card-${i}`);
  for (const id of ids) state.cards.set(id, new CardInstanceState({
    id, definitionId: id, face: "front", orientation: "upright", x: 0, y: 0,
    stackId: "stack-1", zIndex: 0,
  }));
  state.stacks.set("stack-1", new CardStackState({
    id: "stack-1", x: 10, y: 20, cardIds: ids, zIndex: 4,
  }));
  return state;
}

describe("stack manipulation", () => {
  it("moves only with an active owner lock", () => {
    const state = stateWithStack();
    expect(() => moveStack(state, "alice", { stackId: "stack-1", x: 30, y: 40 }, 10, 50)).toThrow("claimed");
    state.locks.set("stack:stack-1", new ObjectLockState({ objectKind: "stack", objectId: "stack-1", playerId: "alice", expiresAt: 20 }));
    moveStack(state, "alice", { stackId: "stack-1", x: 30, y: 40 }, 10, 50);
    expect(state.stacks.get("stack-1")).toMatchObject({ x: 30, y: 40 });
    expect(state.locks.get("stack:stack-1")?.expiresAt).toBe(60);
  });

  it("draws exactly the top card and preserves a multi-card stack", () => {
    const state = stateWithStack(3);
    const drawn = drawTopCard(state, { stackId: "stack-1", x: 100, y: 200 });
    expect(drawn).toMatchObject({ id: "card-2", stackId: undefined, x: 100, y: 200 });
    expect([...state.stacks.get("stack-1")!.cardIds]).toEqual(["card-0", "card-1"]);
  });

  it("atomically collapses a two-card stack after drawing", () => {
    const state = stateWithStack(2);
    drawTopCard(state, { stackId: "stack-1", x: 100, y: 200 });
    expect(state.stacks.size).toBe(0);
    expect(state.cards.get("card-0")).toMatchObject({ stackId: undefined, x: 10, y: 20, zIndex: 4 });
  });

  it("deletes a whole consistent stack and rejects inconsistent state", () => {
    const state = stateWithStack();
    deleteStack(state, "stack-1");
    expect(state.cards.size).toBe(0);
    expect(state.stacks.size).toBe(0);

    const broken = stateWithStack();
    broken.cards.get("card-1")!.stackId = "wrong";
    const before = broken.toJSON();
    expect(() => deleteStack(broken, "stack-1")).toThrow("inconsistent");
    expect(broken.toJSON()).toEqual(before);
  });
});
