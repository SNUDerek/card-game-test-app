import { stat } from "node:fs/promises";
import { CardCatalogError, loadCardSources } from "../cards/load-card-catalog.js";
import type { WorkspaceDatabase } from "../db/connection.js";
import { SetRepository } from "../db/sets.js";
import type { ImageStore } from "./image-store.js";
import { importCardSet } from "./import-cards.js";

export interface SampleSeedResult {
  seeded: boolean;
  reason?: "disabled" | "missing_directory" | "workspace_not_empty" | "invalid_catalog";
}

/** Imports the bundled cards once, without preventing startup for missing or invalid sample data. */
export async function seedSampleSetIfEmpty(
  db: WorkspaceDatabase,
  imageStore: ImageStore,
  cardsDir: string | undefined,
): Promise<SampleSeedResult> {
  if (!cardsDir) return { seeded: false, reason: "disabled" };

  try {
    if (!(await stat(cardsDir)).isDirectory()) {
      return { seeded: false, reason: "missing_directory" };
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return { seeded: false, reason: "missing_directory" };
    }
    throw cause;
  }

  if (new SetRepository(db).list({ includeArchived: true }).length > 0) {
    return { seeded: false, reason: "workspace_not_empty" };
  }

  try {
    const sources = await loadCardSources(cardsDir);
    importCardSet(db, imageStore, sources, "Sample Set", null);
    return { seeded: true };
  } catch (cause) {
    if (!(cause instanceof CardCatalogError)) throw cause;
    console.error("Sample card catalog is invalid; continuing without seeding.", cause);
    return { seeded: false, reason: "invalid_catalog" };
  }
}
