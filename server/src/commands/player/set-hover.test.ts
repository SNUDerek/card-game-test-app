import { describe, expect, it } from "vitest";
import { CardInstanceState, PlayerState, RoomState } from "../../rooms/state/RoomState.js";
import { clearHoversOfCard, clearPlayerHover, setPlayerHover } from "./set-hover.js";
import { deleteCard } from "../card/delete-card.js";

function stateWithPlayers() {
  const state = new RoomState();
  state.cards.set("card-1", new CardInstanceState({
    id: "card-1", definitionId: "d", face: "front", orientation: "upright",
    x: 0, y: 0, zIndex: 0,
  }));
  state.players.set("alice", new PlayerState({
    id: "alice", displayName: "Alice", connected: true, joinOrder: 0,
  }));
  state.players.set("bob", new PlayerState({
    id: "bob", displayName: "Bob", connected: true, joinOrder: 1,
  }));
  return state;
}

describe("setPlayerHover", () => {
  it("records and clears a player's own hover", () => {
    const state = stateWithPlayers();

    expect(setPlayerHover(state, "alice", "card-1")).toBe(true);
    expect(state.players.get("alice")!.hoveredCardId).toBe("card-1");

    expect(setPlayerHover(state, "alice", null)).toBe(false);
    expect(state.players.get("alice")!.hoveredCardId).toBeUndefined();
  });

  it("lets several players hover the same card, claiming nothing", () => {
    const state = stateWithPlayers();

    setPlayerHover(state, "alice", "card-1");
    setPlayerHover(state, "bob", "card-1");

    expect(state.players.get("alice")!.hoveredCardId).toBe("card-1");
    expect(state.players.get("bob")!.hoveredCardId).toBe("card-1");
    // Presence must not create a lock.
    expect(state.locks.size).toBe(0);
  });

  it("treats a hover of a vanished card as hovering nothing, not as an error", () => {
    const state = stateWithPlayers();
    setPlayerHover(state, "alice", "card-1");

    // A hover and a delete crossing on the wire is routine, and this command
    // is fire-and-forget: throwing here used to take the whole room down.
    expect(setPlayerHover(state, "alice", "ghost")).toBe(false);
    expect(state.players.get("alice")!.hoveredCardId).toBeUndefined();
  });

  it("rejects an unknown player", () => {
    const state = stateWithPlayers();
    expect(() => setPlayerHover(state, "nobody", "card-1")).toThrow("Unknown player");
  });
});

describe("hover cleanup", () => {
  it("clears one player's hover without touching another's", () => {
    const state = stateWithPlayers();
    setPlayerHover(state, "alice", "card-1");
    setPlayerHover(state, "bob", "card-1");

    clearPlayerHover(state, "alice");

    expect(state.players.get("alice")!.hoveredCardId).toBeUndefined();
    expect(state.players.get("bob")!.hoveredCardId).toBe("card-1");
  });

  it("leaves no dangling hover when a card is deleted", () => {
    const state = stateWithPlayers();
    setPlayerHover(state, "alice", "card-1");
    setPlayerHover(state, "bob", "card-1");

    deleteCard(state, "alice", "card-1", 10);

    expect(state.players.get("alice")!.hoveredCardId).toBeUndefined();
    expect(state.players.get("bob")!.hoveredCardId).toBeUndefined();
  });

  it("clears hovers of a named card only", () => {
    const state = stateWithPlayers();
    state.cards.set("card-2", new CardInstanceState({
      id: "card-2", definitionId: "d", face: "front", orientation: "upright",
      x: 0, y: 0, zIndex: 0,
    }));
    setPlayerHover(state, "alice", "card-1");
    setPlayerHover(state, "bob", "card-2");

    clearHoversOfCard(state, "card-1");

    expect(state.players.get("alice")!.hoveredCardId).toBeUndefined();
    expect(state.players.get("bob")!.hoveredCardId).toBe("card-2");
  });
});
