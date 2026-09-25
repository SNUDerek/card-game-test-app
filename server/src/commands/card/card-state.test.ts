import { describe, expect, it } from "vitest";
import { CardInstanceState, ObjectLockState, RoomState } from "../../rooms/state/RoomState.js";
import { flipCard } from "./flip-card.js";
import { setCardOrientation } from "./tap-card.js";

function stateWithCard(stackId?: string) {
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
      stackId,
      zIndex: 0,
    }),
  );
  return state;
}

const flip = (state: RoomState, cardId: string) => flipCard(state, "alice", cardId, 10);
const tap = (state: RoomState, cardId: string) =>
  setCardOrientation(state, "alice", cardId, 10, "tapped");
const untap = (state: RoomState, cardId: string) =>
  setCardOrientation(state, "alice", cardId, 10, "upright");

describe("card face and orientation commands", () => {
  it("flips a card in both directions", () => {
    const state = stateWithCard();
    expect(flip(state, "card-1")).toBe("back");
    expect(flip(state, "card-1")).toBe("front");
  });

  it("taps and untaps idempotently", () => {
    const state = stateWithCard();
    expect(tap(state, "card-1")).toBe("tapped");
    expect(tap(state, "card-1")).toBe("tapped");
    expect(untap(state, "card-1")).toBe("upright");
    expect(untap(state, "card-1")).toBe("upright");
  });

  it.each([flip, tap, untap])("rejects unknown cards without mutation", (command) => {
    const state = new RoomState();
    expect(() => command(state, "missing")).toThrow("Unknown card");
    expect(state.cards.size).toBe(0);
  });

  it.each([flip, tap, untap])(
    "rejects independently manipulating stacked cards",
    (command) => {
      const state = stateWithCard("stack-1");
      expect(() => command(state, "card-1")).toThrow("stack");
      expect(state.cards.get("card-1")).toMatchObject({
        face: "front",
        orientation: "upright",
      });
    },
  );

  it.each([flip, tap, untap])(
    "refuses to manipulate a card another player is holding",
    (command) => {
      const state = stateWithCard();
      state.locks.set(
        "card:card-1",
        new ObjectLockState({
          objectKind: "card",
          objectId: "card-1",
          playerId: "bob",
          expiresAt: 100,
        }),
      );
      expect(() => command(state, "card-1")).toThrow("claimed by another player");
      expect(state.cards.get("card-1")).toMatchObject({
        face: "front",
        orientation: "upright",
      });
    },
  );
});
