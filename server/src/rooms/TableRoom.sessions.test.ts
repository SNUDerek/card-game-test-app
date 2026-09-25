import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { defineRoom } from "colyseus";
import { TableRoom } from "./TableRoom.js";

describe("TableRoom sessions", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot({
      rooms: { table: defineRoom(TableRoom, { cardDefinitionIds: ["spell-1"] }) },
    });
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  it("lets anyone with the room id join an unprotected room", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");

    const alice = await colyseus.sdk.joinById(room.roomId, { displayName: "Alice" });
    await room.waitForNextPatch();

    expect(alice.roomId).toBe(room.roomId);
    expect(room.state.players.size).toBe(1);
  });

  it("admits a protected room only with the correct password", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", { password: "open-sesame" });
    const alice = await colyseus.sdk.joinById(room.roomId, {
      displayName: "Alice",
      password: "open-sesame",
    });
    await room.waitForNextPatch();
    expect(alice.state.players.size).toBe(1);

    await expect(
      colyseus.sdk.joinById(room.roomId, { displayName: "Mallory" }),
    ).rejects.toThrow("Incorrect room password");
    await expect(
      colyseus.sdk.joinById(room.roomId, { displayName: "Mallory", password: "guess" }),
    ).rejects.toThrow("Incorrect room password");

    expect(room.state.players.size).toBe(1);
  });

  it("never synchronizes the room password to clients", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", { password: "open-sesame" });
    const alice = await colyseus.connectTo(room, {
      displayName: "Alice",
      password: "open-sesame",
    });
    await room.waitForNextPatch();

    expect(JSON.stringify(alice.state.toJSON())).not.toContain("open-sesame");
    expect(Object.keys(room.state.toJSON())).not.toContain("password");
  });

  it("makes the first player to join the host and leaves it there", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    await room.waitForNextPatch();

    const host = room.state.players.get(room.state.hostPlayerId);
    expect(host?.displayName).toBe("Alice");
    expect(alice.state.hostPlayerId).toBe(room.state.hostPlayerId);
    expect(bob.state.hostPlayerId).toBe(room.state.hostPlayerId);

    const joinOrders = [...room.state.players.values()].map((player) => player.joinOrder);
    expect(joinOrders).toEqual([0, 1]);
  });

  it("keeps rooms out of matchmaking so the id is the only way in", async () => {
    const first = await colyseus.createRoom<TableRoom>("table");
    await colyseus.connectTo(first, { displayName: "Alice" });

    const outsider = await colyseus.sdk.joinOrCreate("table", { displayName: "Mallory" });

    expect(outsider.roomId).not.toBe(first.roomId);
  });
});
