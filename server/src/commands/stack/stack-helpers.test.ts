import { describe, expect, it } from "vitest";
import { CardInstanceState, RoomState } from "../../rooms/state/RoomState.js";
import { addCardToStack, collapseStackIfNeeded, createStack } from "./stack-helpers.js";

function addCard(state: RoomState, id: string, x: number, zIndex: number) {
  state.cards.set(id, new CardInstanceState({
    id,
    definitionId: `definition-${id}`,
    face: "front",
    orientation: "upright",
    x,
    y: x + 1,
    zIndex,
  }));
}

describe("stack invariant helpers", () => {
  it("creates a bottom-to-top stack with bidirectional membership", () => {
    const state = new RoomState();
    addCard(state, "bottom", 20, 4);
    addCard(state, "top", 100, 7);

    const stack = createStack(state, "bottom", "top", () => "stack-1");

    expect(stack.toJSON()).toEqual({
      id: "stack-1", x: 20, y: 21, cardIds: ["bottom", "top"], zIndex: 8,
    });
    expect(state.cards.get("bottom")?.stackId).toBe("stack-1");
    expect(state.cards.get("top")?.stackId).toBe("stack-1");
  });

  it("adds a standalone card to the top of a consistent stack", () => {
    const state = new RoomState();
    addCard(state, "a", 0, 0);
    addCard(state, "b", 1, 1);
    addCard(state, "c", 2, 2);
    const stack = createStack(state, "a", "b", () => "stack-1");

    addCardToStack(state, "c", stack.id);

    expect([...stack.cardIds]).toEqual(["a", "b", "c"]);
    expect(state.cards.get("c")?.stackId).toBe(stack.id);
  });

  it("collapses one remaining card using the stack transform", () => {
    const state = new RoomState();
    addCard(state, "a", 0, 0);
    addCard(state, "b", 1, 1);
    const stack = createStack(state, "a", "b", () => "stack-1");
    stack.x = 50;
    stack.y = 60;
    stack.zIndex = 9;
    stack.cardIds.pop();
    state.cards.delete("b");

    collapseStackIfNeeded(state, stack.id);

    expect(state.stacks.size).toBe(0);
    expect(state.cards.get("a")).toMatchObject({
      stackId: undefined, x: 50, y: 60, zIndex: 9,
    });
  });

  it("rejects invalid inputs without partial mutation", () => {
    const state = new RoomState();
    addCard(state, "a", 0, 0);
    addCard(state, "b", 1, 1);
    const stack = createStack(state, "a", "b", () => "stack-1");
    addCard(state, "c", 2, 2);
    state.cards.get("a")!.stackId = "wrong-stack";
    const before = state.toJSON();

    expect(() => addCardToStack(state, "c", stack.id)).toThrow("inconsistent");
    expect(state.toJSON()).toEqual(before);
    expect(() => createStack(state, "c", "c", () => "stack-2")).toThrow("itself");
    expect(state.cards.get("c")?.stackId).toBeUndefined();
  });
});
