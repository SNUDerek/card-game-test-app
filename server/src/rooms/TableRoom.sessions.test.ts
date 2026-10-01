import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { defineRoom } from "colyseus";
import { ROOM_COMMANDS, TABLE_COMMANDS, type SessionResult } from "@card-table/shared";
import { TableRoom } from "./TableRoom.js";
import { fixedCardLibrary } from "./test-card-library.js";

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
      rooms: {
        table: defineRoom(TableRoom, {
          setId: "set-1",
          cardLibrary: fixedCardLibrary(["spell-1"]),
          authenticate: () => ({ id: "user-alice", username: "alice", displayName: "Alice" }),
        }),
        // No session cookie resolves to an account.
        anonymous: defineRoom(TableRoom, {
          setId: "set-1",
          cardLibrary: fixedCardLibrary(["spell-1"]),
          authenticate: () => undefined,
        }),
      },
    });
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  it("lets an authenticated account join by room id", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");

    const alice = await colyseus.sdk.joinById(room.roomId);
    await room.waitForNextPatch();

    expect(alice.roomId).toBe(room.roomId);
    expect(room.state.players.size).toBe(1);
  });

  it("rejects a connection without a signed-in account", async () => {
    await expect(colyseus.sdk.joinOrCreate("anonymous")).rejects.toThrow("Authentication required.");
  });

  it("synchronizes account identity without exposing credentials", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    expect([...alice.state.players.values()][0]?.userId).toBe("user-alice");
  });

  it("keeps rooms public so the authenticated room browser can list them", async () => {
    const first = await colyseus.createRoom<TableRoom>("table");
    await colyseus.connectTo(first);

    const outsider = await colyseus.sdk.joinOrCreate("table");

    expect(outsider.roomId).toBe(first.roomId);
  });

  it("restores the same player identity after an unconsented drop", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      reconnectionGraceSeconds: 5,
    });
    const alice = await colyseus.connectTo(room);
    await colyseus.connectTo(room);
    const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 0,
      y: 0,
    });
    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, {
      object: { kind: "card", id: cardId },
    });
    const playerId = await sessionPlayerId(alice);
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
    const alice = await colyseus.connectTo(room);
    const bob = await colyseus.connectTo(room);
    const bobPlayerId = await sessionPlayerId(bob);
    const reconnectionToken = alice.reconnectionToken;

    alice.reconnection.enabled = false;
    await alice.leave(false);
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);

    await wait(400);
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(1);
    expect([...room.state.players.keys()]).toEqual([bobPlayerId]);
    await expect(colyseus.sdk.reconnect(reconnectionToken)).rejects.toThrow();
  });

  it("gives up a dropped player's identity immediately on a consented leave", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      reconnectionGraceSeconds: 5,
    });
    const alice = await colyseus.connectTo(room);
    await colyseus.connectTo(room);
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
    const alice = await colyseus.connectTo(room);
    const playerId = await sessionPlayerId(alice);
    await room.waitForNextPatch();

    expect(room.state.players.get(playerId)?.displayName).toBe("Alice");
    expect(playerId).not.toBe(alice.sessionId);

    const reconnectionToken = alice.reconnectionToken;
    await alice.leave(false);
    const rejoined = await colyseus.sdk.reconnect(reconnectionToken);

    expect(await sessionPlayerId(rejoined)).toBe(playerId);
  });
});
