import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCardSources } from "../cards/load-card-catalog.js";
import { openDatabase, type WorkspaceDatabase } from "../db/connection.js";
import { CardRepository } from "../db/cards.js";
import { ImageRepository } from "../db/images.js";
import { pngBytes } from "../db/test-fixtures.js";
import { ImageStore } from "./image-store.js";
import { importCardSet } from "./import-cards.js";

let db: WorkspaceDatabase;
let dir: string;

beforeEach(() => {
  db = openDatabase(":memory:");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "import-cards-test-"));
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeCard(stem: string, json: object, image: Buffer) {
  fs.writeFileSync(path.join(dir, "cards", `${stem}.json`), JSON.stringify(json));
  fs.writeFileSync(path.join(dir, "cards", `${stem}.png`), image);
}

describe("importCardSet", () => {
  it("creates a new set with UUID cards, source ids in metadata, and shared images", async () => {
    fs.mkdirSync(path.join(dir, "cards"));
    writeCard("red_potion", { id: "item-1", type: "item", body: "Heal.", rarity: "common" }, pngBytes(32));
    writeCard("blue_potion", { id: "item-2", type: "item", body: "Mana." }, pngBytes(32));
    const store = new ImageStore(new ImageRepository(db), path.join(dir, "images"));

    const sources = await loadCardSources(path.join(dir, "cards"));
    const { set, cardCount } = importCardSet(db, store, sources, "Potions");

    expect(set.name).toBe("Potions");
    expect(cardCount).toBe(2);
    const cards = new CardRepository(db).listBySet(set.id);
    expect(cards.map((card) => [card.name, card.type, card.body, card.metadata])).toEqual([
      ["Blue Potion", "item", "Mana.", { sourceId: "item-2" }],
      ["Red Potion", "item", "Heal.", { rarity: "common", sourceId: "item-1" }],
    ]);
    expect(cards[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cards[0]!.imageId).toBe(cards[1]!.imageId);
    expect(store.list()).toHaveLength(1);
  });
});
