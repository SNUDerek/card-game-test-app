import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CardCatalogError, loadCardCatalog } from "./load-card-catalog.js";

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

function pngBuffer(width: number, height: number): Buffer {
  // Minimal fixture: PNG signature + just enough of an IHDR chunk for
  // `image-size` to read width/height. No real pixel data is needed.
  const buf = Buffer.alloc(24);
  buf.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "latin1");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

interface WriteCardOptions {
  json?: string | object | null;
  imageExt?: string;
  imageBytes?: Buffer;
  width?: number;
  height?: number;
}

async function writeCard(cardsDir: string, stem: string, options: WriteCardOptions = {}) {
  const { json, imageExt = "png", width = 32, height = 32 } = options;

  if (json !== null) {
    const body =
      typeof json === "string"
        ? json
        : JSON.stringify(json ?? { id: `id-${stem}`, type: "item", body: "..." });
    await writeFile(path.join(cardsDir, `${stem}.json`), body);
  }

  if (imageExt !== "") {
    const bytes = options.imageBytes ?? pngBuffer(width, height);
    await writeFile(path.join(cardsDir, `${stem}.${imageExt}`), bytes);
  }
}

async function makeDir(): Promise<string> {
  dir = await mkdtemp(path.join(os.tmpdir(), "card-catalog-test-"));
  return dir;
}

describe("loadCardCatalog", () => {
  it("loads valid card pairs into a catalog", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "red_potion", {
      json: { id: "item-red-potion", type: "item", body: "Restores health." },
    });

    const catalog = await loadCardCatalog(cardsDir);

    expect(catalog.size).toBe(1);
    const card = catalog.get("item-red-potion");
    expect(card).toMatchObject({
      id: "item-red-potion",
      name: "Red Potion",
      type: "item",
      body: "Restores health.",
      imageUrl: "/cards/red_potion.png",
      sourceName: "red_potion",
    });
    expect(card?.metadata).toBeUndefined();
  });

  it("preserves unknown JSON fields as metadata", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "goblin", {
      json: { id: "creature-goblin", type: "creature", body: "...", flavor: "Sneaky." },
    });

    const catalog = await loadCardCatalog(cardsDir);
    expect(catalog.get("creature-goblin")?.metadata).toEqual({ flavor: "Sneaky." });
  });

  it("rejects an image with no matching JSON", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "orphan_image", { json: null });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("image without matching JSON")],
    });
  });

  it("rejects a JSON file with no matching image", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "orphan_json", { imageExt: "" });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("JSON without matching image")],
    });
  });

  it("rejects malformed JSON", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "broken", { json: "{ not valid json" });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("malformed JSON")],
    });
  });

  it("rejects JSON missing a required field", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "incomplete", { json: { id: "x", type: "item" } });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("invalid card definition")],
    });
  });

  it("rejects JSON with a field of the wrong type", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "wrong_type", { json: { id: 5, type: "item", body: "..." } });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("invalid card definition")],
    });
  });

  it("rejects an unsupported image format", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "unsupported", {
      json: { id: "x", type: "item", body: "..." },
      imageExt: "gif",
      imageBytes: Buffer.from("GIF89a"),
    });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("unsupported image format")],
    });
  });

  it("rejects jpeg because the catalog contract supports only jpg and png", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "unsupported", {
      json: { id: "x", type: "item", body: "..." },
      imageExt: "jpeg",
      imageBytes: Buffer.from("not-a-supported-image"),
    });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("unsupported image format")],
    });
  });

  it("rejects non-square image dimensions", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "wide", {
      json: { id: "x", type: "item", body: "..." },
      width: 64,
      height: 32,
    });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("non-square image dimensions")],
    });
  });

  it.each([16, 600])("rejects out-of-range image dimensions (%ipx)", async (size) => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "bad_size", {
      json: { id: "x", type: "item", body: "..." },
      width: size,
      height: size,
    });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("out-of-range image dimensions")],
    });
  });

  it("rejects duplicate card ids across different files", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "card_a", { json: { id: "dup", type: "item", body: "A" } });
    await writeCard(cardsDir, "card_b", { json: { id: "dup", type: "item", body: "B" } });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("duplicate card id 'dup'")],
    });
  });

  it("rejects ambiguous multiple images for one stem", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "ambiguous", { json: { id: "x", type: "item", body: "..." } });
    await writeCard(cardsDir, "ambiguous", { json: null, imageExt: "jpg" });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("multiple candidate images")],
    });
  });

  it("rejects ambiguous multiple JSON files for one stem", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "ambiguous", { json: { id: "x", type: "item", body: "..." } });
    await writeFile(
      path.join(cardsDir, "ambiguous.JSON"),
      JSON.stringify({ id: "y", type: "item", body: "..." }),
    );

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("multiple candidate JSON files")],
    });
  });

  it("rejects a filename that cannot produce a display name", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "__", { json: { id: "x", type: "item", body: "..." } });

    await expect(loadCardCatalog(cardsDir)).rejects.toMatchObject({
      issues: [expect.stringContaining("invalid derived card definition")],
    });
  });

  it("aggregates every issue across the directory into one failure", async () => {
    const cardsDir = await makeDir();
    await writeCard(cardsDir, "broken_a", { json: "{ not valid" });
    await writeCard(cardsDir, "broken_b", { json: { id: "y" } });

    let error: unknown;
    try {
      await loadCardCatalog(cardsDir);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(CardCatalogError);
    expect((error as CardCatalogError).issues).toHaveLength(2);
  });
});
