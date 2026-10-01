import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { defineRoom } from "colyseus";
import { ROOM_EVENTS, TABLE_COMMANDS, type CatalogChangedEvent } from "@card-table/shared";
import { openDatabase, type WorkspaceDatabase } from "../db/connection.js";
import { SetRepository } from "../db/sets.js";
import { cardContent, seedImage, seedUser } from "../db/test-fixtures.js";
import { CardLibrary } from "../library/card-library.js";
import { SetUsageRegistry } from "../library/set-usage.js";
import { TableRoom } from "./TableRoom.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition.");
    await wait(10);
  }
}

describe("TableRoom bound to a library set", () => {
  let colyseus: ColyseusTestServer;
  let db: WorkspaceDatabase;
  let library: CardLibrary;
  let usage: SetUsageRegistry;
  let userId: string;
  let imageId: string;

  beforeAll(async () => {
    db = openDatabase(":memory:");
    library = new CardLibrary(db);
    usage = new SetUsageRegistry();
    userId = seedUser(db, "user-alice");
    db.prepare("UPDATE users SET display_name = 'Alice' WHERE id = ?").run(userId);
    imageId = seedImage(db);

    colyseus = await boot({
      rooms: {
        table: defineRoom(TableRoom, {
          cardLibrary: library,
          usageRegistry: usage,
          displayNameFor: (id: string) => (id === userId ? "Alice" : undefined),
          reconnectionGraceSeconds: 0,
          authenticate: (_cookie, options) => {
            const displayName = String((options as { displayName?: string })?.displayName ?? "").trim();
            return displayName ? { id: `user-${displayName}`, username: displayName, displayName } : undefined;
          },
        }),
      },
    });
  });

  afterAll(async () => {
    await colyseus.shutdown();
    db.close();
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  function createSet(name: string) {
    return new SetRepository(db).create({ name }, userId);
  }

  it("holds the set's usage lock for its whole life and releases it on disposal", async () => {
    const set = createSet("Locked");
    const room = await colyseus.createRoom<TableRoom>("table", { setId: set.id });
    expect(usage.roomsUsing(set.id)).toEqual([room.roomId]);

    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    await alice.leave();

    await until(() => !usage.isInUse(set.id));
  });

  it("synchronizes its set id to clients", async () => {
    const set = createSet("Synced");
    const room = await colyseus.createRoom<TableRoom>("table", { setId: set.id });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    await room.waitForNextPatch();

    expect(alice.state.setId).toBe(set.id);
  });

  it("spawns only active cards of its own set, including ones created mid-game", async () => {
    const set = createSet("Mine");
    const other = createSet("Theirs");
    const mine = library.createCard(set.id, cardContent(imageId), userId);
    const theirs = library.createCard(other.id, cardContent(imageId), userId);
    const room = await colyseus.createRoom<TableRoom>("table", { setId: set.id });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });

    await expect(
      alice.request(TABLE_COMMANDS.SPAWN_CARD, { definitionId: mine.id, x: 0, y: 0 }),
    ).resolves.toMatchObject({ cardId: expect.any(String) });
    await expect(
      alice.request(TABLE_COMMANDS.SPAWN_CARD, { definitionId: theirs.id, x: 0, y: 0 }),
    ).rejects.toThrow("Unknown card definition");

    const added = library.createCard(set.id, cardContent(imageId, { name: "Late" }), userId);
    await expect(
      alice.request(TABLE_COMMANDS.SPAWN_DECK, {
        source: "entries",
        entries: [{ cardId: added.id, copies: 2 }],
        x: 0,
        y: 0,
        shuffle: false,
        face: "front",
      }),
    ).resolves.toMatchObject({ kind: "stack", cardCount: 2 });
  });

  it("tells members about edits to its set, naming the editor, and ignores other sets", async () => {
    const set = createSet("Edited");
    const other = createSet("Elsewhere");
    const card = library.createCard(set.id, cardContent(imageId), userId);
    const room = await colyseus.createRoom<TableRoom>("table", { setId: set.id });
    const alice = await colyseus.connectTo(room, { displayName: "Alice" });

    const received: CatalogChangedEvent[] = [];
    alice.onMessage(ROOM_EVENTS.CATALOG_CHANGED, (event: CatalogChangedEvent) => received.push(event));

    library.createCard(other.id, cardContent(imageId), userId);
    library.updateCard(card.id, card.revision, cardContent(imageId, { body: "Deal 4 damage." }), userId);

    await until(() => received.length > 0);
    await wait(50);
    expect(received).toEqual([
      { setId: set.id, changedCardIds: [card.id], editorName: "Alice" },
    ]);
  });

  it("stops listening for library changes once disposed", async () => {
    const set = createSet("Gone");
    const before = library.listenerCount("changed");
    const room = await colyseus.createRoom<TableRoom>("table", { setId: set.id });
    expect(library.listenerCount("changed")).toBe(before + 1);

    const alice = await colyseus.connectTo(room, { displayName: "Alice" });
    await alice.leave();

    await until(() => library.listenerCount("changed") === before);
  });
});
