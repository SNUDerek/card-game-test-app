import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type WorkspaceDatabase } from "../db/connection.js";
import { ImageRepository } from "../db/images.js";
import { pngBytes } from "../db/test-fixtures.js";
import { ImageStore } from "../library/image-store.js";
import { WorkspaceService } from "../library/workspace-service.js";
import { SetUsageRegistry } from "../library/set-usage.js";
import { registerRoomRoutes, type RoomGateway } from "./room-routes.js";
import { registerWorkspaceRoutes } from "./workspace-routes.js";
import { workspaceErrorHandler } from "./errors.js";

let db: WorkspaceDatabase;
let server: Server;
let baseUrl: string;
let dataDirectory: string;
let gateway: RoomGateway;
let repository: WorkspaceService;
let usage: SetUsageRegistry;

beforeEach(async () => {
  db = openDatabase(":memory:");
  db.prepare(`INSERT INTO users (id, username, display_name, password_hash, password_salt, created_at)
    VALUES ('user-1', 'alice', 'Alice', 'hash', 'salt', ?)`).run(Date.now());
  dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "card-table-routes-"));
  const images = new ImageStore(new ImageRepository(db), path.join(dataDirectory, "images"));
  usage = new SetUsageRegistry();
  repository = new WorkspaceService(db, images, usage);
  gateway = {
    create: vi.fn(async () => ({ roomId: "room-1", sessionId: "seat-1" }) as never),
    list: vi.fn(async () => [{ roomId: "room-1", clients: 2, maxClients: 16,
      metadata: { name: "Playtest", setId: "set-id" } }]),
    end: vi.fn(async () => undefined),
  };
  const app = express();
  app.use((req, _res, next) => { Object.assign(req, {
    user: { id: "user-1", username: "alice", displayName: "Alice" }, sessionToken: "token",
  }); next(); });
  registerRoomRoutes(app, { workspace: repository, gateway });
  registerWorkspaceRoutes(app, repository, images);
  app.use(workspaceErrorHandler);
  server = await new Promise<Server>((resolve) => {
    const running = app.listen(0, () => resolve(running));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

async function json(pathname: string, method = "GET", body?: unknown) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json().catch(() => undefined) as any };
}

async function createSet() {
  const result = await json("/api/sets", "POST", { name: "Skirmish", description: "v1" });
  expect(result.response.status).toBe(201);
  return result.body.set as { id: string; revision: number };
}

async function uploadImage() {
  const bytes = fs.readFileSync(new URL("../../../cards/goblin.png", import.meta.url));
  const response = await fetch(`${baseUrl}/api/images`, {
    method: "POST", headers: { "Content-Type": "image/png" }, body: bytes,
  });
  expect(response.status).toBe(201);
  return (await response.json() as any).image as { id: string; imageUrl: string };
}

describe("workspace HTTP routes", () => {
  it("supports set CRUD with revision conflicts", async () => {
    const set = await createSet();
    const listed = await json("/api/sets");
    expect(listed.body.sets).toHaveLength(1);

    const updated = await json(`/api/sets/${set.id}`, "PATCH", { name: "Skirmish v2", revision: set.revision });
    expect(updated.body.set.name).toBe("Skirmish v2");
    expect((await json(`/api/sets/${set.id}`, "PATCH", { name: "stale", revision: set.revision })).response.status).toBe(409);
    expect((await json(`/api/sets/${set.id}`, "DELETE")).response.status).toBe(204);
    expect((await json("/api/sets")).body.sets).toHaveLength(0);
  });

  it("uploads immutable images and supports card CRUD", async () => {
    const set = await createSet();
    const image = await uploadImage();
    expect((await json("/api/images")).body.images).toHaveLength(1);
    const served = await fetch(`${baseUrl}${image.imageUrl}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toContain("immutable");

    const created = await json(`/api/sets/${set.id}/cards`, "POST", {
      name: "Goblin", type: "creature", body: "Sneaky", imageId: image.id,
    });
    expect(created.response.status).toBe(201);
    const card = created.body.card;
    expect((await json(`/api/sets/${set.id}/cards`)).body.cards[0]).toMatchObject({ name: "Goblin", imageUrl: image.imageUrl });
    const updated = await json(`/api/cards/${card.id}`, "PUT", {
      name: "Big Goblin", type: "creature", body: "Sneakier", imageId: image.id, revision: card.revision,
    });
    expect(updated.body.card).toMatchObject({ name: "Big Goblin", revision: 2 });
    expect((await json(`/api/cards/${card.id}`, "DELETE")).response.status).toBe(204);
    const restored = await json(`/api/cards/${card.id}/restore`, "POST");
    expect(restored.response.status).toBe(200);
    expect(restored.body.card).toMatchObject({ id: card.id, archived: false });
  });

  it("rejects invalid uploads, cross-set decks, and archiving in-use content", async () => {
    const mismatch = await fetch(`${baseUrl}/api/images`, {
      method: "POST", headers: { "Content-Type": "image/jpeg" }, body: pngBytes(64),
    });
    expect(mismatch.status).toBe(400);
    const nonSquare = await fetch(`${baseUrl}/api/images`, {
      method: "POST", headers: { "Content-Type": "image/png" }, body: pngBytes(64, 32),
    });
    expect(nonSquare.status).toBe(400);

    const first = await createSet();
    const second = await createSet();
    const image = await uploadImage();
    const card = (await json(`/api/sets/${first.id}/cards`, "POST", {
      name: "Goblin", type: "creature", body: "Sneaky", imageId: image.id,
    })).body.card;
    expect((await json(`/api/sets/${second.id}/decks`, "POST", {
      name: "Wrong set", entries: [{ cardId: card.id, copies: 1 }],
    })).response.status).toBe(400);

    await json(`/api/sets/${first.id}/decks`, "POST", {
      name: "Army", entries: [{ cardId: card.id, copies: 1 }],
    });
    expect((await json(`/api/cards/${card.id}`, "DELETE")).response.status).toBe(409);
    usage.acquire(first.id, "room-active");
    const inUse = await json(`/api/sets/${first.id}`, "DELETE");
    expect(inUse.response.status).toBe(409);
    expect(inUse.body.code).toBe("in_use");
  });

  it("blocks card edits and deck creation or duplication in archived sets", async () => {
    const set = await createSet();
    const image = await uploadImage();
    const card = (await json(`/api/sets/${set.id}/cards`, "POST", {
      name: "Goblin", type: "creature", body: "Sneaky", imageId: image.id,
    })).body.card;
    const deck = (await json(`/api/sets/${set.id}/decks`, "POST", {
      name: "Army", entries: [{ cardId: card.id, copies: 1 }],
    })).body.deck;
    await json(`/api/sets/${set.id}`, "DELETE");

    expect((await json(`/api/cards/${card.id}`, "PUT", {
      name: "Changed", type: "creature", body: "Changed", imageId: image.id, revision: card.revision,
    })).response.status).toBe(409);
    expect((await json(`/api/sets/${set.id}/decks`, "POST", {
      name: "Another", entries: [{ cardId: card.id, copies: 1 }],
    })).response.status).toBe(409);
    expect((await json(`/api/decks/${deck.id}/duplicate`, "POST", {})).response.status).toBe(409);
  });

  it("returns a distinct stale revision error code", async () => {
    const set = await createSet();
    await json(`/api/sets/${set.id}`, "PATCH", { name: "Updated", revision: set.revision });
    const stale = await json(`/api/sets/${set.id}`, "PATCH", { name: "Stale", revision: set.revision });
    expect(stale.response.status).toBe(409);
    expect(stale.body.code).toBe("stale_revision");
  });

  it("supports deck CRUD, generation, duplication, forking, and ZIP export", async () => {
    const set = await createSet();
    const image = await uploadImage();
    const card = (await json(`/api/sets/${set.id}/cards`, "POST", {
      name: "Goblin", type: "creature", body: "Sneaky", imageId: image.id,
    })).body.card;
    const created = await json(`/api/sets/${set.id}/decks`, "POST", {
      name: "Army", entries: [{ cardId: card.id, copies: 2 }],
    });
    expect(created.response.status).toBe(201);
    const deck = created.body.deck;
    expect((await json(`/api/decks/${deck.id}`)).body.deck.entries).toEqual([{ cardId: card.id, copies: 2 }]);
    expect((await json(`/api/sets/${set.id}/decks/generate`, "POST", {
      params: { size: 3, maxCopies: 3, seed: "fixed" },
    })).body.entries).toEqual([{ cardId: card.id, copies: 3 }]);
    expect((await json(`/api/decks/${deck.id}/duplicate`, "POST", {})).response.status).toBe(201);
    const fork = await json(`/api/sets/${set.id}/fork`, "POST", { name: "Skirmish fork" });
    expect(fork.body.set).toMatchObject({ name: "Skirmish fork", forkedFromSetId: set.id, cardCount: 1, deckCount: 2 });

    const exported = await fetch(`${baseUrl}/api/sets/${set.id}/export`);
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("application/zip");
    expect((await exported.arrayBuffer()).byteLength).toBeGreaterThan(100);
    expect((await json(`/api/decks/${deck.id}`, "DELETE")).response.status).toBe(204);
  });

  it("creates, lists, and ends temporary rooms through the gateway", async () => {
    const set = await createSet();
    const created = await json("/api/rooms", "POST", { setId: set.id, name: "Playtest" });
    expect(created.response.status).toBe(201);
    expect(created.body).toMatchObject({ roomId: "room-1", sessionId: "seat-1" });
    expect(gateway.create).toHaveBeenCalledWith(expect.objectContaining({ setId: set.id, setName: "Skirmish" }), expect.anything());
    expect((await json("/api/rooms")).body.rooms[0]).toMatchObject({ id: "room-1", playerCount: 2, name: "Playtest" });
    expect((await json("/api/rooms/room-1/end", "POST")).response.status).toBe(204);
    expect(gateway.end).toHaveBeenCalledWith("room-1", "Alice");
  });
});
