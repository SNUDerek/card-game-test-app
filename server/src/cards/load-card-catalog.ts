import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { imageSizeFromFile } from "image-size/fromFile";
import {
  CARD_IMAGE_MAX_SIZE,
  CARD_IMAGE_MIN_SIZE,
  CardDefinitionSourceSchema,
} from "@card-table/shared";

const SUPPORTED_IMAGE_EXTENSIONS = new Set([".jpg", ".png"]);

/** A card as described by its JSON file, with the display name taken from the file stem. */
export interface CardFileDefinition {
  /** The JSON file's own id. Unique within the folder; not a library card id. */
  id: string;
  name: string;
  type: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/** One validated card pair: its definition and the absolute path of its artwork. */
export interface CardSourceFile {
  definition: CardFileDefinition;
  /** The shared file stem, for error messages. */
  stem: string;
  imagePath: string;
}

export class CardCatalogError extends Error {
  readonly issues: readonly string[];

  constructor(issues: string[]) {
    super(
      `card catalog failed validation with ${issues.length} issue(s):\n` +
        issues.map((issue) => `  - ${issue}`).join("\n"),
    );
    this.name = "CardCatalogError";
    this.issues = issues;
  }
}

function deriveDisplayName(stem: string): string {
  return stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

function isSupportedImage(fileName: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

interface StemFiles {
  jsonFiles: string[];
  images: string[];
}

async function groupFilesByStem(cardsDir: string): Promise<Map<string, StemFiles>> {
  const entries = await readdir(cardsDir, { withFileTypes: true });
  const byStem = new Map<string, StemFiles>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    const stem = path.basename(entry.name, path.extname(entry.name));
    const files = byStem.get(stem) ?? { jsonFiles: [], images: [] };

    if (ext === ".json") {
      files.jsonFiles.push(entry.name);
    } else {
      files.images.push(entry.name);
    }

    byStem.set(stem, files);
  }

  return byStem;
}

/**
 * Validates every JSON/image pair in `cardsDir`, sorted by file stem, for the
 * library importer.
 * Collects every validation issue across every file before failing, so a
 * single run reports the full set of problems rather than just the first.
 */
export async function loadCardSources(cardsDir: string): Promise<CardSourceFile[]> {
  const byStem = [...(await groupFilesByStem(cardsDir)).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const issues: string[] = [];
  const sources: CardSourceFile[] = [];

  for (const [stem, { jsonFiles, images }] of byStem) {
    if (jsonFiles.length === 0) {
      issues.push(`image without matching JSON: ${images.join(", ")}`);
      continue;
    }
    if (images.length === 0) {
      issues.push(`JSON without matching image: ${jsonFiles.join(", ")}`);
      continue;
    }
    if (jsonFiles.length > 1) {
      issues.push(`multiple candidate JSON files for card '${stem}': ${jsonFiles.join(", ")}`);
      continue;
    }

    const json = jsonFiles[0]!;
    const supportedImages = images.filter(isSupportedImage);
    for (const unsupported of images.filter((img) => !isSupportedImage(img))) {
      issues.push(`unsupported image format: ${unsupported}`);
    }
    if (supportedImages.length === 0) {
      continue;
    }
    if (supportedImages.length > 1) {
      issues.push(`multiple candidate images for card '${stem}': ${supportedImages.join(", ")}`);
      continue;
    }

    const imageFile = supportedImages[0]!;

    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path.join(cardsDir, json), "utf-8"));
    } catch (err) {
      issues.push(`malformed JSON in ${json}: ${(err as Error).message}`);
      continue;
    }

    const parsed = CardDefinitionSourceSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      issues.push(`invalid card definition in ${json}: ${detail}`);
      continue;
    }

    let width: number;
    let height: number;
    try {
      ({ width, height } = await imageSizeFromFile(path.join(cardsDir, imageFile)));
    } catch (err) {
      issues.push(`unreadable image file ${imageFile}: ${(err as Error).message}`);
      continue;
    }
    if (width !== height) {
      issues.push(`non-square image dimensions for ${imageFile}: ${width}x${height}`);
      continue;
    }
    if (width < CARD_IMAGE_MIN_SIZE || width > CARD_IMAGE_MAX_SIZE) {
      issues.push(
        `out-of-range image dimensions for ${imageFile}: ${width}x${height} ` +
          `(must be ${CARD_IMAGE_MIN_SIZE}-${CARD_IMAGE_MAX_SIZE}px)`,
      );
      continue;
    }

    const { id, type, body, ...metadata } = parsed.data;
    const name = deriveDisplayName(stem);
    if (name === "") {
      issues.push(`invalid derived card definition for ${json}: the file name gives an empty display name`);
      continue;
    }
    sources.push({
      definition: {
        id,
        name,
        type,
        body,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      },
      stem,
      imagePath: path.join(cardsDir, imageFile),
    });
  }

  const stemsById = new Map<string, string[]>();
  for (const { definition: def, stem } of sources) {
    const stems = stemsById.get(def.id) ?? [];
    stems.push(stem);
    stemsById.set(def.id, stems);
  }
  for (const [id, stems] of stemsById) {
    if (stems.length > 1) {
      issues.push(`duplicate card id '${id}' used by: ${stems.join(", ")}`);
    }
  }

  if (issues.length > 0) {
    throw new CardCatalogError(issues);
  }

  return sources;
}
