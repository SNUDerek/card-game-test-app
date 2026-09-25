import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { imageSizeFromFile } from "image-size/fromFile";
import {
  CardDefinitionSchema,
  CardDefinitionSourceSchema,
  type CardDefinition,
  type CardDefinitionId,
} from "@card-table/shared";

const SUPPORTED_IMAGE_EXTENSIONS = new Set([".jpg", ".png"]);
const MIN_IMAGE_DIMENSION = 32;
const MAX_IMAGE_DIMENSION = 512;

export type CardCatalog = ReadonlyMap<CardDefinitionId, CardDefinition>;

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
 * Scans `cardsDir` for matching JSON/image pairs and builds the card catalog.
 * Collects every validation issue across every file before failing, so a
 * single run reports the full set of problems rather than just the first.
 */
export async function loadCardCatalog(cardsDir: string): Promise<CardCatalog> {
  const byStem = [...(await groupFilesByStem(cardsDir)).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const issues: string[] = [];
  const definitions: CardDefinition[] = [];

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
    if (width < MIN_IMAGE_DIMENSION || width > MAX_IMAGE_DIMENSION) {
      issues.push(
        `out-of-range image dimensions for ${imageFile}: ${width}x${height} ` +
          `(must be ${MIN_IMAGE_DIMENSION}-${MAX_IMAGE_DIMENSION}px)`,
      );
      continue;
    }

    const { id, type, body, ...metadata } = parsed.data;
    const definition = CardDefinitionSchema.safeParse({
      id,
      name: deriveDisplayName(stem),
      type,
      body,
      imageUrl: `/cards/${imageFile}`,
      sourceName: stem,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    });
    if (!definition.success) {
      const detail = definition.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      issues.push(`invalid derived card definition for ${json}: ${detail}`);
      continue;
    }
    definitions.push(definition.data);
  }

  const sourcesById = new Map<string, string[]>();
  for (const def of definitions) {
    const sources = sourcesById.get(def.id) ?? [];
    sources.push(def.sourceName);
    sourcesById.set(def.id, sources);
  }
  for (const [id, sources] of sourcesById) {
    if (sources.length > 1) {
      issues.push(`duplicate card id '${id}' used by: ${sources.join(", ")}`);
    }
  }

  if (issues.length > 0) {
    throw new CardCatalogError(issues);
  }

  return new Map(definitions.map((def) => [def.id, def]));
}
