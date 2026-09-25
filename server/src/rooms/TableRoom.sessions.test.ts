import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { defineRoom } from "colyseus";
import { ROOM_COMMANDS, TABLE_COMMANDS, type SessionResult } from "@card-table/shared";
import { TableRoom } from "./TableRoom.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Asks the room which PlayerId this connection belongs to. */
async function sessionPlayerId(room: {
  request: (type: string) => Promise<SessionResult>;
}): Promise<string> {
  const { playerId } = await room.request(ROOM_COMMANDS.SESSION);
  return playerId;
}

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

  it("restores the same player identity after an unconsented drop", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      reconnectionGraceSeconds: 5,
    });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    await colyseus.connectTo(room, { displayName: "Bob" });
    const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 0,
      y: 0,
    });
    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, {
      object: { kind: "card", id: cardId },
    });
    const playerId = [...room.state.players.values()].find(
      (player) => player.displayName === "Alice",
    )?.id as string;
    const reconnectionToken = alice.reconnectionToken;

    await alice.leave(false);
    await room.waitForNextPatch();

    // The seat is held, but the lock is not (data-models.md §51).
    expect(room.state.players.size).toBe(2);
    expect(room.state.players.get(playerId)?.connected).toBe(false);
    expect(room.state.locks.size).toBe(0);
    expect(room.state.cards.size).toBe(1);

    const rejoined = await colyseus.sdk.reconnect(reconnectionToken);
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(2);
    const restored = room.state.players.get(playerId);
    expect(restored?.connected).toBe(true);
    expect(restored?.displayName).toBe("Alice");
    expect(rejoined.state.players.get(playerId)?.displayName).toBe("Alice");
  });

  it("removes a dropped player once the grace period expires", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      reconnectionGraceSeconds: 0.2,
    });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    await colyseus.connectTo(room, { displayName: "Bob" });
    const reconnectionToken = alice.reconnectionToken;

    alice.reconnection.enabled = false;
    await alice.leave(false);
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);

    await wait(400);
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(1);
    expect([...room.state.players.values()][0]?.displayName).toBe("Bob");
    await expect(colyseus.sdk.reconnect(reconnectionToken)).rejects.toThrow();
  });

  it("gives up a dropped player's identity immediately on a consented leave", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      reconnectionGraceSeconds: 5,
    });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    await colyseus.connectTo(room, { displayName: "Bob" });
    const reconnectionToken = alice.reconnectionToken;

    await alice.leave();
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(1);
    await expect(colyseus.sdk.reconnect(reconnectionToken)).rejects.toThrow();
  });

  it("tells each client which synchronized player it is, on join and on reconnect", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      reconnectionGraceSeconds: 5,
    });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const playerId = await sessionPlayerId(alice);
    await room.waitForNextPatch();

    expect(room.state.players.get(playerId)?.displayName).toBe("Alice");
    expect(playerId).not.toBe(alice.sessionId);

    const reconnectionToken = alice.reconnectionToken;
    await alice.leave(false);
    const rejoined = await colyseus.sdk.reconnect(reconnectionToken);

    expect(await sessionPlayerId(rejoined)).toBe(playerId);
  });

  it("keeps the host while they are only disconnected, then migrates on expiry", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      reconnectionGraceSeconds: 0.2,
    });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    await colyseus.connectTo(room, { displayName: "Bob" });
    const carol = await colyseus.connectTo(room, { displayName: "Carol" });
    const hostPlayerId = room.state.hostPlayerId;

    alice.reconnection.enabled = false;
    await alice.leave(false);
    await room.waitForNextPatch();
    expect(room.state.hostPlayerId).toBe(hostPlayerId);

    await wait(400);
    await room.waitForNextPatch();

    const host = room.state.players.get(room.state.hostPlayerId);
    expect(host?.displayName).toBe("Bob");
    expect(carol.state.hostPlayerId).toBe(room.state.hostPlayerId);
  });

  it("migrates the host immediately when they leave on purpose", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });

    await alice.leave();
    await room.waitForNextPatch();

    expect(room.state.players.get(room.state.hostPlayerId)?.displayName).toBe("Bob");
    expect(bob.state.hostPlayerId).toBe(room.state.hostPlayerId);
  });

  it("gives the room to a returning player when the host left it empty", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      reconnectionGraceSeconds: 5,
    });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    const bobToken = bob.reconnectionToken;

    // Bob drops first, so no connected player is left to inherit the room.
    await bob.leave(false);
    await room.waitForNextPatch();
    await alice.leave();
    await room.waitForNextPatch();
    expect(room.state.hostPlayerId).toBe("");

    const rejoined = await colyseus.sdk.reconnect(bobToken);
    await room.waitForNextPatch();

    expect(room.state.players.get(room.state.hostPlayerId)?.displayName).toBe("Bob");
    expect(rejoined.state.hostPlayerId).toBe(room.state.hostPlayerId);
  });
});
