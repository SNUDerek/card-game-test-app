import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type WorkspaceDatabase } from "../db/connection.js";
import { ImageRepository } from "../db/images.js";
import { SetRepository } from "../db/sets.js";
import { pngBytes } from "../db/test-fixtures.js";
import { ImageStore } from "./image-store.js";
import { seedSampleSetIfEmpty } from "./seed-sample-set.js";

let db: WorkspaceDatabase;
let directory: string;
let imageStore: ImageStore;

beforeEach(async () => {
  db = openDatabase(":memory:");
  directory = await mkdtemp(path.join(os.tmpdir(), "card-table-seed-"));
  imageStore = new ImageStore(new ImageRepository(db), path.join(directory, "images"));
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function writeCard(folder: string, stem: string) {
  await writeFile(path.join(folder, `${stem}.json`), JSON.stringify({
    id: stem,
    type: "unit",
    body: `${stem} rules`,
  }));
  await writeFile(path.join(folder, `${stem}.png`), pngBytes(64));
}

describe("seedSampleSetIfEmpty", () => {
  it("seeds an empty workspace once", async () => {
    const cardsDir = path.join(directory, "cards");
    await mkdir(cardsDir);
    await writeCard(cardsDir, "alpha");
    await writeCard(cardsDir, "beta");

    await expect(seedSampleSetIfEmpty(db, imageStore, cardsDir)).resolves.toEqual({ seeded: true });
    expect(new SetRepository(db).list({ includeArchived: true })[0]).toMatchObject({
      name: "Sample Set",
      cardCount: 2,
    });
    await expect(seedSampleSetIfEmpty(db, imageStore, cardsDir)).resolves.toEqual({
      seeded: false,
      reason: "workspace_not_empty",
    });
    expect(new SetRepository(db).list({ includeArchived: true })).toHaveLength(1);
  });

  it("does not seed when the only set is archived", async () => {
    const sets = new SetRepository(db);
    const archived = sets.create({ name: "Old set" }, null);
    sets.setArchived(archived.id, true);

    await expect(seedSampleSetIfEmpty(db, imageStore, directory)).resolves.toEqual({
      seeded: false,
      reason: "workspace_not_empty",
    });
  });

  it("does nothing for a missing directory", async () => {
    await expect(seedSampleSetIfEmpty(db, imageStore, path.join(directory, "missing"))).resolves.toEqual({
      seeded: false,
      reason: "missing_directory",
    });
  });

  it("logs an invalid catalog and leaves the workspace empty", async () => {
    await writeFile(path.join(directory, "broken.json"), "not json");
    await writeFile(path.join(directory, "broken.png"), pngBytes(64));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(seedSampleSetIfEmpty(db, imageStore, directory)).resolves.toEqual({
      seeded: false,
      reason: "invalid_catalog",
    });
    expect(error).toHaveBeenCalledOnce();
    expect(new SetRepository(db).list({ includeArchived: true })).toHaveLength(0);
  });
});
