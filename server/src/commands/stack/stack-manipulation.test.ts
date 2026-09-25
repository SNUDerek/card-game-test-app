import { describe, expect, it } from "vitest";
import { CardInstanceState, CardStackState, ObjectLockState, RoomState } from "../../rooms/state/RoomState.js";
import { moveStack } from "./move-stack.js";
import { drawTopCard } from "./draw-top-card.js";
import { deleteStack } from "./delete-stack.js";
import { shuffleStack } from "./shuffle-stack.js";

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
    const drawn = drawTopCard(state, "alice", { stackId: "stack-1", x: 100, y: 200 }, 10);
    expect(drawn).toMatchObject({ id: "card-2", stackId: undefined, x: 100, y: 200 });
    expect([...state.stacks.get("stack-1")!.cardIds]).toEqual(["card-0", "card-1"]);
  });

  it("atomically collapses a two-card stack after drawing", () => {
    const state = stateWithStack(2);
    drawTopCard(state, "alice", { stackId: "stack-1", x: 100, y: 200 }, 10);
    expect(state.stacks.size).toBe(0);
    expect(state.cards.get("card-0")).toMatchObject({ stackId: undefined, x: 10, y: 20, zIndex: 4 });
  });

  it("refuses to draw from or delete a stack another player holds", () => {
    const state = stateWithStack();
    state.locks.set("stack:stack-1", new ObjectLockState({
      objectKind: "stack", objectId: "stack-1", playerId: "bob", expiresAt: 100,
    }));
    const before = state.toJSON();
    expect(() => drawTopCard(state, "alice", { stackId: "stack-1", x: 1, y: 2 }, 10))
      .toThrow("claimed by another player");
    expect(() => deleteStack(state, "alice", "stack-1", 10)).toThrow("claimed by another player");
    expect(state.toJSON()).toEqual(before);

    // The same commands succeed once the foreign lock has expired.
    drawTopCard(state, "alice", { stackId: "stack-1", x: 1, y: 2 }, 200);
    expect(state.cards.get("card-2")).toMatchObject({ stackId: undefined });
  });

  it("releases the stack lock when a stack collapses", () => {
    const state = stateWithStack(2);
    state.locks.set("stack:stack-1", new ObjectLockState({
      objectKind: "stack", objectId: "stack-1", playerId: "alice", expiresAt: 100,
    }));
    drawTopCard(state, "alice", { stackId: "stack-1", x: 100, y: 200 }, 10);
    expect(state.stacks.size).toBe(0);
    expect(state.locks.has("stack:stack-1")).toBe(false);
  });

  it("reorders a stack without changing its membership", () => {
    const state = stateWithStack(4);
    // Always picking the first candidate rotates the array by one.
    shuffleStack(state, "alice", "stack-1", 10, () => 0);

    const cardIds = [...state.stacks.get("stack-1")!.cardIds];
    expect(cardIds).toEqual(["card-1", "card-2", "card-3", "card-0"]);
    expect([...cardIds].sort()).toEqual(["card-0", "card-1", "card-2", "card-3"]);
    for (const id of cardIds) expect(state.cards.get(id)!.stackId).toBe("stack-1");
  });

  it("leaves face and orientation with the card when shuffling", () => {
    const state = stateWithStack(3);
    state.cards.get("card-0")!.face = "back";
    state.cards.get("card-2")!.orientation = "tapped";

    shuffleStack(state, "alice", "stack-1", 10, () => 0);

    expect(state.cards.get("card-0")).toMatchObject({ face: "back", orientation: "upright" });
    expect(state.cards.get("card-2")).toMatchObject({ face: "front", orientation: "tapped" });
  });

  it("refuses to shuffle a stack or a card another player holds", () => {
    const state = stateWithStack();
    state.locks.set("stack:stack-1", new ObjectLockState({
      objectKind: "stack", objectId: "stack-1", playerId: "bob", expiresAt: 100,
    }));
    const before = state.toJSON();
    expect(() => shuffleStack(state, "alice", "stack-1", 10, () => 0))
      .toThrow("claimed by another player");
    expect(state.toJSON()).toEqual(before);

    state.locks.delete("stack:stack-1");
    state.locks.set("card:card-1", new ObjectLockState({
      objectKind: "card", objectId: "card-1", playerId: "bob", expiresAt: 100,
    }));
    const beforeCardLock = state.toJSON();
    expect(() => shuffleStack(state, "alice", "stack-1", 10, () => 0))
      .toThrow("claimed by another player");
    expect(state.toJSON()).toEqual(beforeCardLock);
  });

  it("rejects shuffling a stack whose membership is inconsistent", () => {
    const broken = stateWithStack();
    broken.cards.get("card-1")!.stackId = "wrong";
    const before = broken.toJSON();
    expect(() => shuffleStack(broken, "alice", "stack-1", 10, () => 0)).toThrow("inconsistent");
    expect(broken.toJSON()).toEqual(before);
  });

  it("deletes a whole consistent stack and rejects inconsistent state", () => {
    const state = stateWithStack();
    deleteStack(state, "alice", "stack-1", 10);
    expect(state.cards.size).toBe(0);
    expect(state.stacks.size).toBe(0);

    const broken = stateWithStack();
    broken.cards.get("card-1")!.stackId = "wrong";
    const before = broken.toJSON();
    expect(() => deleteStack(broken, "alice", "stack-1", 10)).toThrow("inconsistent");
    expect(broken.toJSON()).toEqual(before);
  });
});
