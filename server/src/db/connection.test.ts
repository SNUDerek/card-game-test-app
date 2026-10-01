import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type WorkspaceDatabase } from "./connection.js";

let db: WorkspaceDatabase | undefined;

afterEach(() => db?.close());

describe("database migrations", () => {
  it("creates the full workspace schema and enables foreign keys", () => {
    db = openDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(expect.arrayContaining([
      "users", "sessions", "images", "card_sets", "cards", "decks", "deck_cards",
    ]));
    expect(db.pragma("user_version", { simple: true })).toBe(1);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("rejects a deck entry whose card belongs to another set", () => {
    db = openDatabase(":memory:");
    const now = Date.now();
    db.prepare("INSERT INTO images VALUES (?, ?, ?, ?, ?, NULL, ?)").run("img", "image/png", 1, 1, 1, now);
    const insertSet = db.prepare("INSERT INTO card_sets (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)");
    insertSet.run("set-a", "A", now, now);
    insertSet.run("set-b", "B", now, now);
    db.prepare("INSERT INTO cards (id, set_id, name, type, body, image_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("card-a", "set-a", "Card", "test", "", "img", 0, now, now);
    db.prepare("INSERT INTO decks (id, set_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("deck-b", "set-b", "Deck", now, now);

    expect(() => db!.prepare("INSERT INTO deck_cards VALUES (?, ?, ?, ?)").run("deck-b", "set-b", "card-a", 1))
      .toThrow(/FOREIGN KEY/);
  });
});
