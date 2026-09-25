import { describe, expect, it } from "vitest";
import { CardInstanceState, ObjectLockState, RoomState } from "../../rooms/state/RoomState.js";
import { stackCard } from "./stack-card.js";

function card(state: RoomState, id: string, face: "front" | "back" = "front") {
  state.cards.set(id, new CardInstanceState({
    id, definitionId: id, face, orientation: "upright", x: id === "target" ? 50 : 0,
    y: 10, zIndex: id === "target" ? 2 : 1,
  }));
}

function lock(state: RoomState, kind: "card" | "stack", id: string, playerId = "alice") {
  state.locks.set(`${kind}:${id}`, new ObjectLockState({
    objectKind: kind, objectId: id, playerId, expiresAt: 100,
  }));
}

describe("stackCard", () => {
  it("atomically creates a card-on-card stack in target/source order", () => {
    const state = new RoomState();
    card(state, "source"); card(state, "target"); lock(state, "card", "source");

    expect(stackCard(state, "alice", {
      cardId: "source", target: { kind: "card", cardId: "target" },
    }, 10, () => "stack-1")).toBe("stack-1");

    expect([...state.stacks.get("stack-1")!.cardIds]).toEqual(["target", "source"]);
    expect(state.stacks.get("stack-1")).toMatchObject({ x: 50, y: 10 });
    expect(state.cards.get("source")?.stackId).toBe("stack-1");
    expect(state.cards.get("target")?.stackId).toBe("stack-1");
    expect(state.locks.size).toBe(0);
  });

  it("adds a card to an existing stack", () => {
    const state = new RoomState();
    card(state, "source"); card(state, "target"); lock(state, "card", "source");
    stackCard(state, "alice", { cardId: "source", target: { kind: "card", cardId: "target" } }, 10, () => "stack-1");
    card(state, "next"); lock(state, "card", "next");

    stackCard(state, "alice", { cardId: "next", target: { kind: "stack", stackId: "stack-1" } }, 20);
    expect([...state.stacks.get("stack-1")!.cardIds]).toEqual(["target", "source", "next"]);
  });

  it.each([
    ["unowned source", () => {}],
    ["mismatched face", (state: RoomState) => { state.cards.get("source")!.face = "back"; }],
    ["target owned by another player", (state: RoomState) => lock(state, "card", "target", "bob")],
  ])("rejects %s without partial mutation", (_label, arrange) => {
    const state = new RoomState();
    card(state, "source"); card(state, "target");
    if (_label !== "unowned source") lock(state, "card", "source");
    arrange(state);
    const before = state.toJSON();
    expect(() => stackCard(state, "alice", {
      cardId: "source", target: { kind: "card", cardId: "target" },
    }, 10, () => "stack-1")).toThrow();
    expect(state.toJSON()).toEqual(before);
  });
});
