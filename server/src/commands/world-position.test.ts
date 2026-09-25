import { describe, expect, it } from "vitest";
import {
  DrawCardPayloadSchema,
  MoveCardPayloadSchema,
  MoveStackPayloadSchema,
  SpawnCardPayloadSchema,
  WORLD_COORDINATE_LIMIT,
} from "@card-table/shared";
import { CardInstanceState, CardStackState, ObjectLockState, RoomState } from "../rooms/state/RoomState.js";
import { assertWorldPosition } from "./world-position.js";
import { spawnCard, MAX_CARDS_PER_ROOM } from "./card/spawn-card.js";
import { moveCard } from "./card/move-card.js";
import { moveStack } from "./stack/move-stack.js";
import { drawTopCard } from "./stack/draw-top-card.js";

const BAD_COORDINATES = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  WORLD_COORDINATE_LIMIT + 1,
  -(WORLD_COORDINATE_LIMIT + 1),
];

/** Every schema that carries a position, so a new one cannot skip the audit. */
const POSITION_SCHEMAS = {
  SPAWN_CARD: SpawnCardPayloadSchema,
  MOVE_CARD: MoveCardPayloadSchema,
  MOVE_STACK: MoveStackPayloadSchema,
  DRAW_CARD: DrawCardPayloadSchema,
};

function tableWithCardAndStack() {
  const state = new RoomState();
  const card = (id: string, stackId?: string) =>
    state.cards.set(id, new CardInstanceState({
      id, definitionId: "spell-1", face: "front", orientation: "upright",
      x: 0, y: 0, stackId, zIndex: 0,
    }));
  card("loose");
  card("bottom", "stack-1");
  card("top", "stack-1");
  state.stacks.set("stack-1", new CardStackState({
    id: "stack-1", x: 0, y: 0, cardIds: ["bottom", "top"], zIndex: 1,
  }));
  for (const key of ["card:loose", "stack:stack-1"]) {
    const [objectKind, objectId] = key.split(":");
    state.locks.set(key, new ObjectLockState({
      objectKind: objectKind as "card" | "stack", objectId: objectId!,
      playerId: "alice", expiresAt: 1_000,
    }));
  }
  return state;
}

describe("world position validation", () => {
  it.each(BAD_COORDINATES)("rejects %s on both axes", (value) => {
    expect(() => assertWorldPosition({ x: value, y: 0 })).toThrow();
    expect(() => assertWorldPosition({ x: 0, y: value })).toThrow();
  });

  it("accepts coordinates exactly on the limit", () => {
    expect(() =>
      assertWorldPosition({ x: WORLD_COORDINATE_LIMIT, y: -WORLD_COORDINATE_LIMIT }),
    ).not.toThrow();
  });

  it.each(Object.entries(POSITION_SCHEMAS))(
    "%s structurally rejects non-finite coordinates",
    (_name, schema) => {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(schema.safeParse({
          x: value, y: 0, cardId: "c", stackId: "s", definitionId: "d",
        }).success).toBe(false);
      }
    },
  );

  it.each(BAD_COORDINATES)(
    "every position-bearing command rejects %s at the domain boundary",
    (value) => {
      const state = tableWithCardAndStack();
      const before = state.toJSON();
      const position = { x: value, y: 0 };

      expect(() => spawnCard(state, new Set(["spell-1"]), { definitionId: "spell-1", ...position }))
        .toThrow(/position/);
      expect(() => moveCard(state, "alice", { cardId: "loose", ...position }, 10, 50))
        .toThrow(/position/);
      expect(() => moveStack(state, "alice", { stackId: "stack-1", ...position }, 10, 50))
        .toThrow(/position/);
      expect(() => drawTopCard(state, "alice", { stackId: "stack-1", ...position }, 10))
        .toThrow(/position/);

      expect(state.toJSON()).toEqual(before);
    },
  );
});

describe("table capacity", () => {
  it("refuses to spawn past the per-room card limit", () => {
    const state = new RoomState();
    const definitions = new Set(["spell-1"]);
    let counter = 0;
    const spawn = () =>
      spawnCard(state, definitions, { definitionId: "spell-1", x: 0, y: 0 }, () => `card-${counter++}`);

    for (let index = 0; index < MAX_CARDS_PER_ROOM; index += 1) spawn();
    expect(state.cards.size).toBe(MAX_CARDS_PER_ROOM);
    expect(spawn).toThrow(/at most/);
    expect(state.cards.size).toBe(MAX_CARDS_PER_ROOM);
  });
});
