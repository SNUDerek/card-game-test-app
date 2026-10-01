import type { LibraryImage } from "@card-table/shared";
import type { WorkspaceDatabase } from "./connection.js";

interface ImageRow {
  id: string;
  mime: LibraryImage["mime"];
  width: number;
  height: number;
  byte_size: number;
  created_at: number;
}

const IMAGE_COLUMNS = "id, mime, width, height, byte_size, created_at";

function mapImage(row: ImageRow): LibraryImage {
  return {
    id: row.id,
    mime: row.mime,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  };
}

/** Image rows only; the bytes live on disk and are handled by `ImageStore`. */
export class ImageRepository {
  constructor(private readonly db: WorkspaceDatabase) {}

  /** Inserts the row unless an image with the same content hash already exists. */
  insertIfMissing(
    image: Omit<LibraryImage, "createdAt">,
    userId: string | null,
    now = Date.now(),
  ): LibraryImage {
    this.db.prepare(`
      INSERT INTO images (id, mime, width, height, byte_size, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `).run(image.id, image.mime, image.width, image.height, image.byteSize, userId, now);
    return this.find(image.id)!;
  }

  find(id: string): LibraryImage | undefined {
    const row = this.db.prepare(`SELECT ${IMAGE_COLUMNS} FROM images WHERE id = ?`).get(id) as
      | ImageRow
      | undefined;
    return row ? mapImage(row) : undefined;
  }

  /** Newest first, for the editor's existing-image picker. */
  list(): LibraryImage[] {
    const rows = this.db.prepare(`SELECT ${IMAGE_COLUMNS} FROM images ORDER BY created_at DESC, id`)
      .all() as ImageRow[];
    return rows.map(mapImage);
  }
}
