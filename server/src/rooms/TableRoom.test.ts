import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { defineRoom } from "colyseus";
import { TableRoom } from "./TableRoom.js";
import { TABLE_COMMANDS } from "@card-table/shared";

describe("TableRoom connection lifecycle", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot({
      rooms: {
        table: defineRoom(TableRoom, { cardDefinitionIds: ["spell-1"] }),
      },
    });
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  it("synchronizes distinct player identities to two clients and removes leavers", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "  Alice  " });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    await room.waitForNextPatch();

    expect(room.state.cards.size).toBe(0);
    expect(room.state.players.size).toBe(2);
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
    expect(bob.state.toJSON()).toEqual(room.state.toJSON());

    const players = [...room.state.players.values()];
    expect(players.map((player) => player.displayName).sort()).toEqual(["Alice", "Bob"]);
    expect(players.every((player) => player.connected)).toBe(true);
    expect(players.every((player) => player.id !== alice.sessionId && player.id !== bob.sessionId)).toBe(
      true,
    );

    await bob.leave();
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(1);
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
    expect([...room.state.players.values()][0]?.displayName).toBe("Alice");
  });

  it.each([
    ["missing", {}],
    ["blank", { displayName: "   " }],
    ["too long", { displayName: "x".repeat(51) }],
  ])("rejects a %s display name", async (_label, options) => {
    await expect(colyseus.sdk.joinOrCreate("table", options)).rejects.toThrow(
      "A display name between 1 and 50 characters is required.",
    );
  });

  it("validates and synchronizes spawned cards", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });

    const result = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 125,
      y: 240,
    });
    await room.waitForNextPatch();

    expect(result.cardId).toEqual(expect.any(String));
    expect(room.state.cards.get(result.cardId)?.toJSON()).toMatchObject({
      definitionId: "spell-1",
      x: 125,
      y: 240,
      face: "front",
      orientation: "upright",
    });
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
    expect(bob.state.toJSON()).toEqual(room.state.toJSON());
  });

  it("rejects malformed and unknown spawn requests without mutation", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });

    await expect(
      alice.request(TABLE_COMMANDS.SPAWN_CARD, {
        definitionId: "spell-1",
        x: Number.POSITIVE_INFINITY,
        y: 0,
      }),
    ).rejects.toThrow("Invalid SPAWN_CARD payload");
    await expect(
      alice.request(TABLE_COMMANDS.SPAWN_CARD, {
        definitionId: "missing",
        x: 0,
        y: 0,
      }),
    ).rejects.toThrow("Unknown card definition");
    expect(room.state.cards.size).toBe(0);
  });
});
