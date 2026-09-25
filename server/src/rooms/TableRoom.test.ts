import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { defineRoom } from "colyseus";
import { TableRoom } from "./TableRoom.js";

describe("TableRoom connection lifecycle", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot({
      rooms: {
        table: defineRoom(TableRoom),
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
});
