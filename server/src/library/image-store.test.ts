import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type WorkspaceDatabase } from "../db/connection.js";
import { ImageRepository } from "../db/images.js";
import { pngBytes } from "../db/test-fixtures.js";
import { ImageStore } from "./image-store.js";

let db: WorkspaceDatabase;
let dir: string;
let store: ImageStore;

beforeEach(() => {
  db = openDatabase(":memory:");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "image-store-test-"));
  store = new ImageStore(new ImageRepository(db), path.join(dir, "images"));
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ImageStore", () => {
  it("stores bytes under their hash and records the image once", () => {
    const bytes = pngBytes(64);
    const hash = createHash("sha256").update(bytes).digest("hex");

    const first = store.save(bytes, null, 10);
    const second = store.save(Buffer.from(bytes), null, 20);

    expect(first).toEqual({ id: hash, mime: "image/png", width: 64, height: 64, byteSize: bytes.length, createdAt: 10 });
    expect(second).toEqual(first);
    expect(fs.readdirSync(store.directory)).toEqual([`${hash}.png`]);
    expect(Buffer.from(store.read(hash))).toEqual(bytes);
    expect(store.list()).toEqual([first]);
  });

  it("rejects unreadable, non-square, and out-of-range images without writing", () => {
    expect(() => store.save(Buffer.from("not an image"), null)).toThrow(expect.objectContaining({ code: "invalid" }));
    expect(() => store.save(pngBytes(64, 32), null)).toThrow(/square/);
    expect(() => store.save(pngBytes(16), null)).toThrow(/32–512px/);
    expect(() => store.save(pngBytes(1024), null)).toThrow(/32–512px/);
    expect(fs.readdirSync(store.directory)).toEqual([]);
    expect(store.list()).toEqual([]);
  });
});
