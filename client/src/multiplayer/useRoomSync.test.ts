import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CardInstance, CardStack, Player } from "@card-table/shared";
import type { ClientRoomState, TableRoom } from "./room";
import { useRoomSync } from "./useRoomSync";

function card(id: string, overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    id,
    definitionId: "spell-001",
    face: "front",
    orientation: "upright",
    x: 0,
    y: 0,
    stackId: "",
    zIndex: 0,
    ...overrides,
  };
}

function stack(id: string, cardIds: string[]): CardStack {
  return { id, x: 10, y: 20, cardIds, zIndex: 1 };
}

function player(id: string, joinOrder: number): Player {
  return { id, displayName: id, connected: true, joinOrder };
}

/**
 * Stands in for a Colyseus room: schema instances mutate in place and then
 * notify, rather than handing over a fresh state object.
 */
function fakeRoom(state: Partial<ClientRoomState> = {}) {
  const listeners: ((state: ClientRoomState) => void)[] = [];
  const roomState: ClientRoomState = {
    cards: new Map(),
    stacks: new Map(),
    players: new Map(),
    hostPlayerId: "",
    ...state,
  };
  const room = {
    state: roomState,
    onStateChange: (cb: (state: ClientRoomState) => void) => void listeners.push(cb),
  } as unknown as TableRoom;

  return {
    room,
    patch(mutate: (state: ClientRoomState) => void) {
      mutate(roomState);
      for (const listener of listeners) listener(roomState);
    },
  };
}

describe("useRoomSync", () => {
  it("copies the room's current state on attach, without waiting for a patch", () => {
    const { room } = fakeRoom({
      cards: new Map([["c1", card("c1", { x: 5 })]]),
      stacks: new Map([["s1", stack("s1", ["c1", "c2"])]]),
      players: new Map([["p1", player("p1", 0)]]),
      hostPlayerId: "p1",
    });
    const { result } = renderHook(() => useRoomSync());

    act(() => result.current.syncRoom(room));

    expect(result.current.cards).toEqual([card("c1", { x: 5 })]);
    expect(result.current.stacks).toEqual([stack("s1", ["c1", "c2"])]);
    expect(result.current.players).toEqual([player("p1", 0)]);
    expect(result.current.hostPlayerId).toBe("p1");
  });

  it("orders players by join order, whatever order the map yields", () => {
    const { room } = fakeRoom({
      players: new Map([
        ["p2", player("p2", 2)],
        ["p0", player("p0", 0)],
        ["p1", player("p1", 1)],
      ]),
    });
    const { result } = renderHook(() => useRoomSync());

    act(() => result.current.syncRoom(room));

    expect(result.current.players.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
  });

  it("re-copies on every patch, so in-place schema mutations reach React", () => {
    const { room, patch } = fakeRoom({ cards: new Map([["c1", card("c1")]]) });
    const { result } = renderHook(() => useRoomSync());
    act(() => result.current.syncRoom(room));
    const before = result.current.cards;

    act(() => patch((state) => void (state.cards.get("c1")!.x = 42)));

    expect(result.current.cards[0].x).toBe(42);
    expect(result.current.cards).not.toBe(before);
    expect(before[0].x).toBe(0);
  });

  it("copies stack card ids rather than aliasing the live array", () => {
    const { room, patch } = fakeRoom({ stacks: new Map([["s1", stack("s1", ["c1", "c2"])]]) });
    const { result } = renderHook(() => useRoomSync());
    act(() => result.current.syncRoom(room));
    const before = result.current.stacks[0].cardIds;

    act(() => patch((state) => void state.stacks.get("s1")!.cardIds.push("c3")));

    expect(before).toEqual(["c1", "c2"]);
    expect(result.current.stacks[0].cardIds).toEqual(["c1", "c2", "c3"]);
  });

  it("empties every synchronized slice on reset", () => {
    const { room } = fakeRoom({
      cards: new Map([["c1", card("c1")]]),
      stacks: new Map([["s1", stack("s1", ["c1", "c2"])]]),
      players: new Map([["p1", player("p1", 0)]]),
      hostPlayerId: "p1",
    });
    const { result } = renderHook(() => useRoomSync());
    act(() => result.current.syncRoom(room));

    act(() => result.current.resetSync());

    expect(result.current.cards).toEqual([]);
    expect(result.current.stacks).toEqual([]);
    expect(result.current.players).toEqual([]);
    expect(result.current.hostPlayerId).toBe("");
  });
});
