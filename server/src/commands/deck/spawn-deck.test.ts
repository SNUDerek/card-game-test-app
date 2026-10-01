import { describe, expect, it } from "vitest";
import { WORLD_COORDINATE_LIMIT, type SpawnDeckPayload } from "@card-table/shared";
import { CardInstanceState, RoomState } from "../../rooms/state/RoomState.js";
import { MAX_CARDS_PER_ROOM } from "../card/spawn-card.js";
import { expandDeckEntries, spawnDeck } from "./spawn-deck.js";

const DEFINITIONS = new Set(["fireball", "goblin", "shield"]);

function sequentialIds() {
  let next = 0;
  return () => `id-${next++}`;
}

function payload(overrides: Partial<SpawnDeckPayload> = {}): SpawnDeckPayload {
  return {
    source: "entries",
    entries: [
      { cardId: "fireball", copies: 2 },
      { cardId: "goblin", copies: 1 },
    ],
    x: 100,
    y: 200,
    shuffle: false,
    face: "back",
    ...overrides,
  };
}

describe("expandDeckEntries", () => {
  it("expands each entry into one id per copy, in entry order", () => {
    expect(
      expandDeckEntries([
        { cardId: "a", copies: 2 },
        { cardId: "b", copies: 1 },
      ]),
    ).toEqual(["a", "a", "b"]);
  });
});

describe("spawnDeck", () => {
  it("deals every copy into one stack, bottom to top in entry order", () => {
    const state = new RoomState();
    const result = spawnDeck(state, DEFINITIONS, payload(), { createId: sequentialIds() });

    expect(result).toEqual({ kind: "stack", stackId: "id-3", cardCount: 3 });
    const stack = state.stacks.get("id-3")!;
    expect(stack.toJSON()).toEqual({
      id: "id-3",
      x: 100,
      y: 200,
      cardIds: ["id-0", "id-1", "id-2"],
      zIndex: 0,
    });
    expect([...stack.cardIds].map((id) => state.cards.get(id)!.definitionId)).toEqual([
      "fireball",
      "fireball",
      "goblin",
    ]);
    for (const id of stack.cardIds) {
      expect(state.cards.get(id)).toMatchObject({
        face: "back",
        orientation: "upright",
        stackId: "id-3",
      });
    }
  });

  it("shuffles with the injected randomness", () => {
    const state = new RoomState();
    // Always picking the first candidate rotates the order by one.
    spawnDeck(state, DEFINITIONS, payload({ shuffle: true }), {
      createId: sequentialIds(),
      randomInt: () => 0,
    });

    const stack = [...state.stacks.values()][0]!;
    expect([...stack.cardIds].map((id) => state.cards.get(id)!.definitionId)).toEqual([
      "fireball",
      "goblin",
      "fireball",
    ]);
  });

  it("deals a one-card deck as a standalone card", () => {
    const state = new RoomState();
    const result = spawnDeck(
      state,
      DEFINITIONS,
      payload({ entries: [{ cardId: "shield", copies: 1 }], face: "front" }),
      { createId: sequentialIds() },
    );

    expect(result).toEqual({ kind: "card", cardId: "id-0" });
    expect(state.stacks.size).toBe(0);
    expect(state.cards.get("id-0")).toMatchObject({ stackId: undefined, face: "front", x: 100 });
  });

  it("places the new stack above everything already on the table", () => {
    const state = new RoomState();
    state.cards.set(
      "existing",
      new CardInstanceState({
        id: "existing", definitionId: "goblin", face: "front", orientation: "upright",
        x: 0, y: 0, zIndex: 7,
      }),
    );
    const result = spawnDeck(state, DEFINITIONS, payload(), { createId: sequentialIds() });

    expect(result.kind === "stack" && state.stacks.get(result.stackId)!.zIndex).toBe(8);
  });

  it("rejects unknown cards without mutating state", () => {
    const state = new RoomState();
    expect(() =>
      spawnDeck(state, DEFINITIONS, payload({ entries: [{ cardId: "missing", copies: 2 }] })),
    ).toThrow("Unknown card definition: missing");
    expect(state.cards.size).toBe(0);
    expect(state.stacks.size).toBe(0);
  });

  it("rejects positions outside the world without mutating state", () => {
    const state = new RoomState();
    expect(() =>
      spawnDeck(state, DEFINITIONS, payload({ x: WORLD_COORDINATE_LIMIT + 1 })),
    ).toThrow("world units");
    expect(state.cards.size).toBe(0);
  });

  it("rejects a deck that would overfill the table, dealing none of it", () => {
    const state = new RoomState();
    for (let i = 0; i < MAX_CARDS_PER_ROOM - 2; i++) {
      state.cards.set(
        `c${i}`,
        new CardInstanceState({
          id: `c${i}`, definitionId: "goblin", face: "front", orientation: "upright",
          x: 0, y: 0, zIndex: 0,
        }),
      );
    }

    expect(() => spawnDeck(state, DEFINITIONS, payload())).toThrow(
      "this deck has 3 and only 2 more fit",
    );
    expect(state.cards.size).toBe(MAX_CARDS_PER_ROOM - 2);
    expect(state.stacks.size).toBe(0);
  });
});
