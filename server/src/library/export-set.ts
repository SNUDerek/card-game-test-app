import { strToU8, zipSync, type Zippable } from "fflate";

/** Bump when the manifest shape changes, so a future importer can tell versions apart. */
export const SET_EXPORT_FORMAT_VERSION = 1;

/**
 * Everything one export needs, read in a single transaction so deck entries
 * always match the cards beside them. Archived cards are already excluded.
 */
export interface SetExportSnapshot {
  set: { name: string; description: string };
  cards: readonly {
    id: string;
    name: string;
    type: string;
    body: string;
    imageId: string;
    metadata?: Record<string, unknown>;
    position: number;
  }[];
  decks: readonly {
    id: string;
    name: string;
    description: string;
    entries: readonly { cardId: string; copies: number }[];
  }[];
  /** Image rows for every `imageId` the cards reference. */
  images: ReadonlyMap<string, { mime: string }>;
}

export interface SetExportManifest {
  formatVersion: typeof SET_EXPORT_FORMAT_VERSION;
  exportedAt: string;
  set: { name: string; description: string };
  cards: {
    exportId: string;
    name: string;
    type: string;
    body: string;
    /** Path of the artwork inside the archive. */
    image: string;
    metadata?: Record<string, unknown>;
  }[];
  decks: {
    exportId: string;
    name: string;
    description: string;
    entries: { card: string; copies: number }[];
  }[];
}

export class SetExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetExportError";
  }
}

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

function imagePath(imageId: string, mime: string | undefined): string {
  const extension = mime && IMAGE_EXTENSIONS[mime];
  if (!extension) throw new SetExportError(`Image ${imageId} has unsupported type ${mime}.`);
  return `images/${imageId}.${extension}`;
}

/**
 * Builds the manifest. Database ids stay out of it: cards and decks get
 * archive-local export ids, so an importer never depends on this server's ids.
 * Cards keep the set's display order.
 */
export function buildSetExportManifest(
  snapshot: SetExportSnapshot,
  exportedAt: Date,
): SetExportManifest {
  const cards = [...snapshot.cards].sort((a, b) => a.position - b.position);
  const exportIdByCardId = new Map(cards.map((card, index) => [card.id, `card-${index + 1}`]));

  return {
    formatVersion: SET_EXPORT_FORMAT_VERSION,
    exportedAt: exportedAt.toISOString(),
    set: { name: snapshot.set.name, description: snapshot.set.description },
    cards: cards.map((card) => ({
      exportId: exportIdByCardId.get(card.id)!,
      name: card.name,
      type: card.type,
      body: card.body,
      image: imagePath(card.imageId, snapshot.images.get(card.imageId)?.mime),
      ...(card.metadata ? { metadata: card.metadata } : {}),
    })),
    decks: snapshot.decks.map((deck, index) => ({
      exportId: `deck-${index + 1}`,
      name: deck.name,
      description: deck.description,
      entries: deck.entries.map((entry) => {
        const card = exportIdByCardId.get(entry.cardId);
        if (!card) {
          throw new SetExportError(`Deck "${deck.name}" references a card not in the export.`);
        }
        return { card, copies: entry.copies };
      }),
    })),
  };
}

/**
 * Packages a set as a ZIP: `set.json` plus each referenced image exactly once.
 * Images are stored uncompressed (they already are compressed); only the
 * manifest is deflated.
 */
export function buildSetExportArchive(
  snapshot: SetExportSnapshot,
  readImage: (imageId: string) => Uint8Array,
  exportedAt: Date = new Date(),
): Uint8Array {
  const manifest = buildSetExportManifest(snapshot, exportedAt);
  const files: Zippable = {
    "set.json": [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }],
  };
  for (const card of snapshot.cards) {
    const path = imagePath(card.imageId, snapshot.images.get(card.imageId)?.mime);
    if (!(path in files)) files[path] = [readImage(card.imageId), { level: 0 }];
  }
  return zipSync(files, { mtime: exportedAt });
}

/** `Skirmish v2` exported on 2026-10-01 → `skirmish-v2-2026-10-01.zip`. */
export function setExportFileName(setName: string, exportedAt: Date): string {
  const slug =
    setName
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "set";
  return `${slug}-${exportedAt.toISOString().slice(0, 10)}.zip`;
}
