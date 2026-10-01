import { describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  SET_EXPORT_FORMAT_VERSION,
  SetExportError,
  buildSetExportArchive,
  buildSetExportManifest,
  setExportFileName,
  type SetExportSnapshot,
} from "./export-set.js";

const EXPORTED_AT = new Date("2026-10-01T12:00:00Z");

function snapshot(overrides: Partial<SetExportSnapshot> = {}): SetExportSnapshot {
  return {
    set: { name: "Skirmish v2", description: "Second pass" },
    cards: [
      // Out of display order on purpose.
      { id: "uuid-b", name: "Troll", type: "creature", body: "Big.", imageId: "hash-shared", position: 2 },
      {
        id: "uuid-a", name: "Goblin", type: "creature", body: "Small.", imageId: "hash-shared",
        position: 1, metadata: { cost: 1 },
      },
      { id: "uuid-c", name: "Fireball", type: "spell", body: "Burn.", imageId: "hash-jpg", position: 3 },
    ],
    decks: [
      {
        id: "deck-uuid", name: "Starter", description: "",
        entries: [
          { cardId: "uuid-c", copies: 2 },
          { cardId: "uuid-a", copies: 3 },
        ],
      },
    ],
    images: new Map([
      ["hash-shared", { mime: "image/png" }],
      ["hash-jpg", { mime: "image/jpeg" }],
    ]),
    ...overrides,
  };
}

describe("buildSetExportManifest", () => {
  it("uses archive-local ids in display order and remaps deck entries", () => {
    const manifest = buildSetExportManifest(snapshot(), EXPORTED_AT);

    expect(manifest).toEqual({
      formatVersion: SET_EXPORT_FORMAT_VERSION,
      exportedAt: "2026-10-01T12:00:00.000Z",
      set: { name: "Skirmish v2", description: "Second pass" },
      cards: [
        {
          exportId: "card-1", name: "Goblin", type: "creature", body: "Small.",
          image: "images/hash-shared.png", metadata: { cost: 1 },
        },
        { exportId: "card-2", name: "Troll", type: "creature", body: "Big.", image: "images/hash-shared.png" },
        { exportId: "card-3", name: "Fireball", type: "spell", body: "Burn.", image: "images/hash-jpg.jpg" },
      ],
      decks: [
        {
          exportId: "deck-1", name: "Starter", description: "",
          entries: [
            { card: "card-3", copies: 2 },
            { card: "card-1", copies: 3 },
          ],
        },
      ],
    });
    expect(JSON.stringify(manifest)).not.toContain("uuid");
  });

  it("refuses a deck entry for a card outside the snapshot", () => {
    const broken = snapshot({
      decks: [{ id: "d", name: "Bad", description: "", entries: [{ cardId: "archived", copies: 1 }] }],
    });
    expect(() => buildSetExportManifest(broken, EXPORTED_AT)).toThrow(SetExportError);
  });

  it("refuses an image with no known type", () => {
    const broken = snapshot({ images: new Map() });
    expect(() => buildSetExportManifest(broken, EXPORTED_AT)).toThrow("unsupported type");
  });
});

describe("buildSetExportArchive", () => {
  it("packages the manifest and each referenced image exactly once", () => {
    const readImage = vi.fn((imageId: string) => new TextEncoder().encode(`bytes of ${imageId}`));
    const archive = buildSetExportArchive(snapshot(), readImage, EXPORTED_AT);
    const files = unzipSync(archive);

    expect(Object.keys(files).sort()).toEqual([
      "images/hash-jpg.jpg",
      "images/hash-shared.png",
      "set.json",
    ]);
    expect(readImage).toHaveBeenCalledTimes(2);
    expect(strFromU8(files["images/hash-shared.png"]!)).toBe("bytes of hash-shared");
    expect(JSON.parse(strFromU8(files["set.json"]!))).toEqual(
      buildSetExportManifest(snapshot(), EXPORTED_AT),
    );
  });

  it("exports a set with no cards or decks", () => {
    const files = unzipSync(
      buildSetExportArchive(snapshot({ cards: [], decks: [] }), () => new Uint8Array(), EXPORTED_AT),
    );
    expect(Object.keys(files)).toEqual(["set.json"]);
  });
});

describe("setExportFileName", () => {
  it("slugs the set name and stamps the date", () => {
    expect(setExportFileName("Skirmish v2 (draft!)", EXPORTED_AT)).toBe(
      "skirmish-v2-draft-2026-10-01.zip",
    );
    expect(setExportFileName("???", EXPORTED_AT)).toBe("set-2026-10-01.zip");
  });
});
