import fs from "node:fs";
import type { CardSet } from "@card-table/shared";
import type { CardSourceFile } from "../cards/load-card-catalog.js";
import type { WorkspaceDatabase } from "../db/connection.js";
import { CardRepository } from "../db/cards.js";
import { SetRepository } from "../db/sets.js";
import type { ImageStore } from "./image-store.js";

/**
 * Creates a new set from a validated card folder. Card ids are new UUIDs, so
 * the file's JSON `id` is kept as `metadata.sourceId`; the file stem's display
 * name becomes the card name and the folder order becomes the display order.
 *
 * Images are stored first: they are content-addressed and never deleted, so a
 * failed import leaves at most a few unused files. The set and its cards are
 * then inserted in one transaction.
 */
export function importCardSet(
  db: WorkspaceDatabase,
  imageStore: ImageStore,
  sources: readonly CardSourceFile[],
  setName: string,
  userId: string | null = null,
): { set: CardSet; cardCount: number } {
  const imageIds = sources.map(({ imagePath }) => imageStore.save(fs.readFileSync(imagePath), userId).id);

  const sets = new SetRepository(db);
  const cards = new CardRepository(db);
  const set = db.transaction(() => {
    const created = sets.create({ name: setName }, userId);
    sources.forEach(({ definition }, index) => {
      cards.create(
        created.id,
        {
          name: definition.name,
          type: definition.type,
          body: definition.body,
          imageId: imageIds[index]!,
          metadata: { ...definition.metadata, sourceId: definition.id },
        },
        userId,
      );
    });
    return created;
  })();
  return { set, cardCount: sources.length };
}
