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
        table: defineRoom(TableRoom, {
          cardDefinitionIds: ["spell-1"],
          lockTimeoutMs: 75,
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

  it("caps joined players so room state cannot grow without bound", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", { maxClients: 2 });
    await colyseus.connectTo(room, { displayName: "Alice" });
    await colyseus.connectTo(room, { displayName: "Bob" });

    await expect(colyseus.connectTo(room, { displayName: "Mallory" })).rejects.toThrow();
    expect(room.state.players.size).toBe(2);
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

  it("synchronizes claim, rejection, idempotent refresh, and release", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 0,
      y: 0,
    });
    const object = { kind: "card", id: cardId };

    const firstClaim = await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, { object });
    const refreshedClaim = await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, { object });
    await expect(bob.request(TABLE_COMMANDS.CLAIM_OBJECT, { object })).rejects.toThrow(
      "already claimed",
    );
    await room.waitForNextPatch();

    expect(refreshedClaim.expiresAt).toBeGreaterThanOrEqual(firstClaim.expiresAt);
    expect(room.state.locks.get(`card:${cardId}`)).toMatchObject({ objectId: cardId });
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
    expect(bob.state.toJSON()).toEqual(room.state.toJSON());

    await alice.request(TABLE_COMMANDS.RELEASE_OBJECT, { object });
    await room.waitForNextPatch();
    expect(room.state.locks.size).toBe(0);
  });

  it("releases locks after timeout and when the owner disconnects", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 0,
      y: 0,
    });
    const object = { kind: "card", id: cardId };

    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, { object });
    expect(room.state.locks.size).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 125));
    expect(room.state.locks.size).toBe(0);

    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, { object });
    expect(room.state.locks.size).toBe(1);
    await alice.leave();
    expect(room.state.locks.size).toBe(0);
  });

  it("only lets the lock owner move a standalone card", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 0,
      y: 0,
    });

    await expect(
      alice.request(TABLE_COMMANDS.MOVE_CARD, { cardId, x: 10, y: 20 }),
    ).rejects.toThrow("must be claimed");
    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, {
      object: { kind: "card", id: cardId },
    });
    await expect(
      bob.request(TABLE_COMMANDS.MOVE_CARD, { cardId, x: 10, y: 20 }),
    ).rejects.toThrow("must be claimed");

    await alice.request(TABLE_COMMANDS.MOVE_CARD, { cardId, x: 125, y: 240 });
    await room.waitForNextPatch();

    expect(room.state.cards.get(cardId)).toMatchObject({ x: 125, y: 240 });
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
    expect(bob.state.toJSON()).toEqual(room.state.toJSON());
  });

  it("synchronizes flip, tap, and untap across clients", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 0,
      y: 0,
    });

    expect(await alice.request(TABLE_COMMANDS.FLIP_CARD, { cardId })).toEqual({ face: "back" });
    expect(await alice.request(TABLE_COMMANDS.TAP_CARD, { cardId })).toEqual({
      orientation: "tapped",
    });
    expect(await alice.request(TABLE_COMMANDS.TAP_CARD, { cardId })).toEqual({
      orientation: "tapped",
    });
    expect(await alice.request(TABLE_COMMANDS.UNTAP_CARD, { cardId })).toEqual({
      orientation: "upright",
    });
    await room.waitForNextPatch();

    expect(room.state.cards.get(cardId)).toMatchObject({ face: "back", orientation: "upright" });
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
    expect(bob.state.toJSON()).toEqual(room.state.toJSON());
  });

  it("rejects invalid card-state command payloads without mutation", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });

    await expect(alice.request(TABLE_COMMANDS.FLIP_CARD, {})).rejects.toThrow(
      "Invalid FLIP_CARD payload",
    );
    await expect(alice.request(TABLE_COMMANDS.TAP_CARD, { cardId: "missing" })).rejects.toThrow(
      "Unknown card",
    );
    expect(room.state.cards.size).toBe(0);
  });

  it("synchronizes explicit and drag-driven bring-to-front ordering", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    const first = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 100,
      y: 100,
    });
    const second = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 100,
      y: 100,
    });

    expect(await alice.request(TABLE_COMMANDS.BRING_TO_FRONT, { cardId: first.cardId })).toEqual({
      zIndex: 2,
    });
    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, {
      object: { kind: "card", id: second.cardId },
    });
    expect(room.state.cards.get(second.cardId)?.zIndex).toBe(3);

    await bob.request(TABLE_COMMANDS.BRING_TO_FRONT, { cardId: first.cardId });
    expect(room.state.cards.get(first.cardId)?.zIndex).toBe(4);
    await alice.request(TABLE_COMMANDS.MOVE_CARD, { cardId: second.cardId, x: 120, y: 140 });
    await room.waitForNextPatch();

    expect(room.state.cards.get(second.cardId)).toMatchObject({ x: 120, y: 140, zIndex: 5 });
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
    expect(bob.state.toJSON()).toEqual(room.state.toJSON());
  });

  it("rejects invalid bring-to-front requests without changing ordering", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });

    await expect(alice.request(TABLE_COMMANDS.BRING_TO_FRONT, {})).rejects.toThrow(
      "Invalid BRING_TO_FRONT payload",
    );
    await expect(
      alice.request(TABLE_COMMANDS.BRING_TO_FRONT, { cardId: "missing" }),
    ).rejects.toThrow("Unknown card");
    expect(room.state.cards.size).toBe(0);
  });

  it("deletes a standalone card for all connected clients", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 0,
      y: 0,
    });

    expect(await alice.request(TABLE_COMMANDS.DELETE_CARD, { cardId })).toEqual({
      deleted: true,
    });
    await room.waitForNextPatch();

    expect(room.state.cards.size).toBe(0);
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
    expect(bob.state.toJSON()).toEqual(room.state.toJSON());
  });

  it("refuses to delete a card another player is holding", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1",
      x: 0,
      y: 0,
    });
    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, {
      object: { kind: "card", id: cardId },
    });

    await expect(bob.request(TABLE_COMMANDS.DELETE_CARD, { cardId })).rejects.toThrow(
      "claimed by another player",
    );
    expect(room.state.cards.has(cardId)).toBe(true);

    expect(await alice.request(TABLE_COMMANDS.DELETE_CARD, { cardId })).toEqual({
      deleted: true,
    });
    expect(room.state.cards.size).toBe(0);
    expect(room.state.locks.size).toBe(0);
  });

  it("rejects invalid and unknown delete requests without mutation", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });

    await expect(alice.request(TABLE_COMMANDS.DELETE_CARD, {})).rejects.toThrow(
      "Invalid DELETE_CARD payload",
    );
    await expect(
      alice.request(TABLE_COMMANDS.DELETE_CARD, { cardId: "missing" }),
    ).rejects.toThrow("Unknown card");
    expect(room.state.cards.size).toBe(0);
  });

  it("creates and synchronizes a stack from two matching standalone cards", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const bob = await colyseus.connectTo(room, { displayName: "Bob" });
    const source = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1", x: 10, y: 20,
    });
    const target = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1", x: 100, y: 200,
    });
    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, {
      object: { kind: "card", id: source.cardId },
    });

    const result = await alice.request(TABLE_COMMANDS.STACK_CARD, {
      cardId: source.cardId,
      target: { kind: "card", cardId: target.cardId },
    });
    await room.waitForNextPatch();

    expect([...room.state.stacks.get(result.stackId)!.cardIds]).toEqual([
      target.cardId, source.cardId,
    ]);
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
    expect(bob.state.toJSON()).toEqual(room.state.toJSON());
  });

  it("moves, draws, manipulates, and deletes stacks authoritatively", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const spawned = [];
    for (let index = 0; index < 3; index += 1) {
      spawned.push(await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
        definitionId: "spell-1", x: index * 20, y: 0,
      }));
    }
    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, { object: { kind: "card", id: spawned[1].cardId } });
    const created = await alice.request(TABLE_COMMANDS.STACK_CARD, {
      cardId: spawned[1].cardId, target: { kind: "card", cardId: spawned[0].cardId },
    });
    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, { object: { kind: "card", id: spawned[2].cardId } });
    await alice.request(TABLE_COMMANDS.STACK_CARD, {
      cardId: spawned[2].cardId, target: { kind: "stack", stackId: created.stackId },
    });

    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, { object: { kind: "stack", id: created.stackId } });
    await alice.request(TABLE_COMMANDS.MOVE_STACK, { stackId: created.stackId, x: 100, y: 120 });
    const drawn = await alice.request(TABLE_COMMANDS.DRAW_CARD, { stackId: created.stackId, x: 200, y: 220 });
    expect(drawn.cardId).toBe(spawned[2].cardId);
    expect(await alice.request(TABLE_COMMANDS.FLIP_CARD, { cardId: spawned[1].cardId })).toEqual({ face: "back" });
    await alice.request(TABLE_COMMANDS.DELETE_CARD, { cardId: spawned[1].cardId });

    expect(room.state.stacks.size).toBe(0);
    expect(room.state.cards.get(spawned[0].cardId)).toMatchObject({ stackId: undefined, x: 100, y: 120 });
    expect(room.state.cards.get(spawned[2].cardId)).toMatchObject({ x: 200, y: 220 });

    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, { object: { kind: "card", id: spawned[2].cardId } });
    const recreated = await alice.request(TABLE_COMMANDS.STACK_CARD, {
      cardId: spawned[2].cardId, target: { kind: "card", cardId: spawned[0].cardId },
    });
    await alice.request(TABLE_COMMANDS.DELETE_STACK, { stackId: recreated.stackId });
    await room.waitForNextPatch();
    expect(room.state.cards.size).toBe(0);
    expect(room.state.stacks.size).toBe(0);
  });

  it("rejects malformed coordinates over the wire without corrupting the room", async () => {
    const room = await colyseus.createRoom<TableRoom>("table");
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    const spawned = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
      definitionId: "spell-1", x: 10, y: 20,
    });
    await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, {
      object: { kind: "card", id: spawned.cardId },
    });

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 10_000_000, "12"]) {
      await expect(
        alice.request(TABLE_COMMANDS.MOVE_CARD, { cardId: spawned.cardId, x: value, y: 0 }),
      ).rejects.toThrow();
      await expect(
        alice.request(TABLE_COMMANDS.SPAWN_CARD, { definitionId: "spell-1", x: 0, y: value }),
      ).rejects.toThrow();
    }

    await room.waitForNextPatch();
    expect(room.state.cards.size).toBe(1);
    expect(room.state.cards.get(spawned.cardId)).toMatchObject({ x: 10, y: 20 });
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
  });

  it("throttles a command flood without dropping the room", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      cardDefinitionIds: ["spell-1"],
      commandRateLimit: { burst: 5, perSecond: 1 },
    });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 40 }, () =>
        alice.request(TABLE_COMMANDS.SPAWN_CARD, { definitionId: "spell-1", x: 0, y: 0 }),
      ),
    );
    const accepted = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const throttled = outcomes.filter(
      (outcome) => outcome.status === "rejected" && /Too many commands/.test(String(outcome.reason)),
    );

    expect(accepted.length).toBeLessThanOrEqual(6);
    expect(throttled.length).toBe(outcomes.length - accepted.length);

    // The room survives the flood and still serves the throttled player.
    await room.waitForNextPatch();
    expect(room.state.cards.size).toBe(accepted.length);
    expect(alice.state.toJSON()).toEqual(room.state.toJSON());
  });

  // Fire-and-forget commands carry no request id, so there is nobody to reject
  // to. An escaping error is not delivered -- it tears the room down and drops
  // every player, which is how a single stale message used to end a session.
  describe("commands sent without awaiting a reply", () => {
    it("survives a hover naming a card that was just deleted", async () => {
      const room = await colyseus.createRoom<TableRoom>("table", {
        cardDefinitionIds: ["spell-1"],
      });
      const alice = await colyseus.connectTo(room, { displayName: "Alice" });
      const bob = await colyseus.connectTo(room, { displayName: "Bob" });

      const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
        definitionId: "spell-1",
        x: 0,
        y: 0,
      });
      alice.send(TABLE_COMMANDS.SET_HOVER, { cardId });
      await room.waitForNextPatch();
      await bob.request(TABLE_COMMANDS.DELETE_CARD, { cardId });

      // The hover Alice already reported now names a card that is gone.
      alice.send(TABLE_COMMANDS.SET_HOVER, { cardId });
      await room.waitForNextPatch();

      expect(room.state.cards.size).toBe(0);
      expect(room.state.players.size).toBe(2);
      for (const player of room.state.players.values()) {
        expect(player.hoveredCardId).toBeUndefined();
      }
      // Still live: the room answers a fresh command from each client.
      await expect(
        alice.request(TABLE_COMMANDS.SPAWN_CARD, { definitionId: "spell-1", x: 5, y: 5 }),
      ).resolves.toMatchObject({ cardId: expect.any(String) });
      expect(bob.connection.isOpen).toBe(true);
    });

    it("survives a rejected move of a card another player holds", async () => {
      const room = await colyseus.createRoom<TableRoom>("table", {
        cardDefinitionIds: ["spell-1"],
      });
      const alice = await colyseus.connectTo(room, { displayName: "Alice" });
      const bob = await colyseus.connectTo(room, { displayName: "Bob" });

      const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
        definitionId: "spell-1",
        x: 0,
        y: 0,
      });
      await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, {
        object: { kind: "card", id: cardId },
      });

      // Throttled drag updates are sent this way, so a drag racing another
      // player's claim reaches the server with no reply to reject to.
      bob.send(TABLE_COMMANDS.MOVE_CARD, { cardId, x: 999, y: 999 });
      await room.waitForNextPatch();

      expect(room.state.cards.get(cardId)).toMatchObject({ x: 0, y: 0 });
      expect(room.state.players.size).toBe(2);
      // Liveness has to be proven by a round-trip: room.state and the socket
      // flags still read fine for a moment after the room has been torn down.
      await expect(
        bob.request(TABLE_COMMANDS.SPAWN_CARD, { definitionId: "spell-1", x: 5, y: 5 }),
      ).resolves.toMatchObject({ cardId: expect.any(String) });
    });

    it("still rejects to a client that does await a reply", async () => {
      const room = await colyseus.createRoom<TableRoom>("table", {
        cardDefinitionIds: ["spell-1"],
      });
      const alice = await colyseus.connectTo(room, { displayName: "Alice" });
      const bob = await colyseus.connectTo(room, { displayName: "Bob" });

      const { cardId } = await alice.request(TABLE_COMMANDS.SPAWN_CARD, {
        definitionId: "spell-1",
        x: 0,
        y: 0,
      });
      await alice.request(TABLE_COMMANDS.CLAIM_OBJECT, {
        object: { kind: "card", id: cardId },
      });

      // Dropping errors on the fire-and-forget path must not have made the
      // request path silently succeed.
      await expect(
        bob.request(TABLE_COMMANDS.MOVE_CARD, { cardId, x: 999, y: 999 }),
      ).rejects.toThrow("must be claimed by this player");
    });
  });
});
