import { createHash } from "node:crypto";
import type { CardContent } from "@card-table/shared";
import type { WorkspaceDatabase } from "./connection.js";

/**
 * Minimal PNG for tests: the signature plus enough of an IHDR chunk for
 * `image-size` to read width/height. `variant` changes the bytes, and so the hash.
 */
export function pngBytes(width: number, height = width, variant = 0): Buffer {
  const buf = Buffer.alloc(25);
  buf.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "latin1");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf.writeUInt8(variant, 24);
  return buf;
}

/** Inserts an image row (no file) and returns its id. */
export function seedImage(db: WorkspaceDatabase, label = "art"): string {
  const id = createHash("sha256").update(label).digest("hex");
  db.prepare(`
    INSERT OR IGNORE INTO images (id, mime, width, height, byte_size, created_at)
    VALUES (?, 'image/png', 64, 64, 100, 0)
  `).run(id);
  return id;
}

/** Inserts a user row for `created_by`/`updated_by` columns and returns its id. */
export function seedUser(db: WorkspaceDatabase, id = "user-1"): string {
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, display_name, password_hash, password_salt, created_at)
    VALUES (?, ?, ?, '', '', 0)
  `).run(id, id, id);
  return id;
}

export function cardContent(imageId: string, overrides: Partial<CardContent> = {}): CardContent {
  return { name: "Fireball", type: "spell", body: "Deal 3 damage.", imageId, ...overrides };
}
