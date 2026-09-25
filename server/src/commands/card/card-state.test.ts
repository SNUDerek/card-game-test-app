import { describe, expect, it } from "vitest";
import { CardInstanceState, RoomState } from "../../rooms/state/RoomState.js";
import { flipCard } from "./flip-card.js";
import { tapCard } from "./tap-card.js";
import { untapCard } from "./untap-card.js";

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

describe("card face and orientation commands", () => {
  it("flips a card in both directions", () => {
    const state = stateWithCard();
    expect(flipCard(state, "card-1")).toBe("back");
    expect(flipCard(state, "card-1")).toBe("front");
  });

  it("taps and untaps idempotently", () => {
    const state = stateWithCard();
    expect(tapCard(state, "card-1")).toBe("tapped");
    expect(tapCard(state, "card-1")).toBe("tapped");
    expect(untapCard(state, "card-1")).toBe("upright");
    expect(untapCard(state, "card-1")).toBe("upright");
  });

  it.each([flipCard, tapCard, untapCard])("rejects unknown cards without mutation", (command) => {
    const state = new RoomState();
    expect(() => command(state, "missing")).toThrow("Unknown card");
    expect(state.cards.size).toBe(0);
  });

  it.each([flipCard, tapCard, untapCard])(
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
});
