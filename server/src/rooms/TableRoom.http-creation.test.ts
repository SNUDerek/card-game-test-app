import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { defineRoom } from "colyseus";
import { RoomCreationRegistry } from "./room-creation.js";
import { TableRoom } from "./TableRoom.js";

describe("TableRoom HTTP-only creation", () => {
  let colyseus: ColyseusTestServer;
  const registry = new RoomCreationRegistry();

  beforeAll(async () => {
    colyseus = await boot({ rooms: { table: defineRoom(TableRoom, {
      requireHttpCreation: true,
      creationRegistry: registry,
      authenticate: () => ({ id: "user-alice", username: "alice", displayName: "Alice" }),
    }) } });
  });

  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  it("rejects socket creation and accepts one HTTP-issued proof", async () => {
    await expect(colyseus.sdk.create("table", { displayName: "Alice", setId: "set-a" }))
      .rejects.toThrow("authenticated HTTP API");

    const creationToken = registry.issue("set-a");
    const room = await colyseus.sdk.create("table", {
      displayName: "Alice", setId: "set-a", setName: "Set A", name: "Playtest", creationToken,
    });
    expect(room.roomId).toEqual(expect.any(String));

    await expect(colyseus.sdk.create("table", {
      displayName: "Bob", setId: "set-a", creationToken,
    })).rejects.toThrow("authenticated HTTP API");
  });
});
