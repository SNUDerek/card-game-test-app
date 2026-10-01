import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";
import { CARD_IMAGE_MAX_SIZE, CARD_IMAGE_MIN_SIZE, type LibraryImage } from "@card-table/shared";
import type { ImageRepository } from "../db/images.js";
import { LibraryError } from "./errors.js";

const MIME_BY_IMAGE_TYPE: Readonly<Record<string, LibraryImage["mime"]>> = {
  png: "image/png",
  jpg: "image/jpeg",
};

const EXTENSION_BY_MIME: Readonly<Record<LibraryImage["mime"], string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

/**
 * Card artwork on disk, named by content hash, with one `images` row per file.
 * Saving the same bytes twice returns the existing image. Images are never
 * deleted, so a forked card can share its source card's file.
 */
export class ImageStore {
  constructor(
    private readonly images: ImageRepository,
    readonly directory: string,
  ) {
    fs.mkdirSync(directory, { recursive: true });
  }

  /**
   * Validates type and dimensions, writes the file if it is new, then inserts
   * the row. The file is written first so a row never points at a missing file.
   */
  save(bytes: Uint8Array, userId: string | null, now = Date.now()): LibraryImage {
    const { mime, width, height } = inspectCardImage(bytes);
    const id = createHash("sha256").update(bytes).digest("hex");
    const existing = this.images.find(id);
    if (existing) return existing;

    const target = this.filePath(id, mime);
    if (!fs.existsSync(target)) {
      const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
      fs.writeFileSync(temporary, bytes);
      fs.renameSync(temporary, target);
    }
    return this.images.insertIfMissing({ id, mime, width, height, byteSize: bytes.byteLength }, userId, now);
  }

  find(id: string): LibraryImage | undefined {
    return this.images.find(id);
  }

  list(): LibraryImage[] {
    return this.images.list();
  }

  filePath(id: string, mime: LibraryImage["mime"]): string {
    return path.join(this.directory, `${id}.${EXTENSION_BY_MIME[mime]}`);
  }

  /** The stored bytes of a known image, for exports. */
  read(id: string): Uint8Array {
    const image = this.images.find(id);
    if (!image) throw new LibraryError("not_found", `Image ${id} not found.`);
    return fs.readFileSync(this.filePath(id, image.mime));
  }
}

/** Accepts square PNG or JPEG artwork within the card image size range. */
export function inspectCardImage(bytes: Uint8Array): {
  mime: LibraryImage["mime"];
  width: number;
  height: number;
} {
  let result: ReturnType<typeof imageSize>;
  try {
    result = imageSize(bytes);
  } catch {
    throw new LibraryError("invalid", "The file is not a readable image.");
  }
  const mime = result.type ? MIME_BY_IMAGE_TYPE[result.type] : undefined;
  if (!mime) throw new LibraryError("invalid", "Images must be PNG or JPEG.");
  const { width, height } = result;
  if (width !== height) {
    throw new LibraryError("invalid", `Images must be square; this one is ${width}×${height}.`);
  }
  if (width < CARD_IMAGE_MIN_SIZE || width > CARD_IMAGE_MAX_SIZE) {
    throw new LibraryError(
      "invalid",
      `Images must be ${CARD_IMAGE_MIN_SIZE}–${CARD_IMAGE_MAX_SIZE}px; this one is ${width}px.`,
    );
  }
  return { mime, width, height };
}
