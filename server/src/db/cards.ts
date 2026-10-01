import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CardContent, LibraryCard } from "@card-table/shared";
import type { WorkspaceDatabase } from "./connection.js";
import { LibraryError, revisionMismatch } from "../library/errors.js";

interface CardRow {
  id: string;
  set_id: string;
  name: string;
  type: string;
  body: string;
  image_id: string;
  metadata: string | null;
  position: number;
  revision: number;
  archived_at: number | null;
  updated_at: number;
}

const CARD_COLUMNS = `
  id, set_id, name, type, body, image_id, metadata, position, revision, archived_at, updated_at
`;

const MetadataColumnSchema = z.record(z.string(), z.unknown());

function mapCard(row: CardRow): LibraryCard {
  return {
    id: row.id,
    setId: row.set_id,
    name: row.name,
    type: row.type,
    body: row.body,
    imageId: row.image_id,
    ...(row.metadata !== null ? { metadata: MetadataColumnSchema.parse(JSON.parse(row.metadata)) } : {}),
    position: row.position,
    revision: row.revision,
    archived: row.archived_at !== null,
    updatedAt: row.updated_at,
  };
}

function metadataColumn(metadata: Record<string, unknown> | undefined): string | null {
  return metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;
}

export class CardRepository {
  constructor(private readonly db: WorkspaceDatabase) {}

  find(id: string): LibraryCard | undefined {
    const row = this.db.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE id = ?`).get(id) as
      | CardRow
      | undefined;
    return row ? mapCard(row) : undefined;
  }

  require(id: string): LibraryCard {
    const card = this.find(id);
    if (!card) throw new LibraryError("not_found", "Card not found.");
    return card;
  }

  /** Every card of a set in display order, archived ones included. */
  listBySet(setId: string): LibraryCard[] {
    const rows = this.db.prepare(`
      SELECT ${CARD_COLUMNS} FROM cards WHERE set_id = ? ORDER BY position, created_at
    `).all(setId) as CardRow[];
    return rows.map(mapCard);
  }

  /** Appends a card to the end of its set's display order. */
  create(setId: string, content: CardContent, userId: string | null, now = Date.now()): LibraryCard {
    this.requireImage(content.imageId);
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO cards (id, set_id, name, type, body, image_id, metadata, position,
                         created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?,
              (SELECT COALESCE(MAX(position) + 1, 0) FROM cards WHERE set_id = ?),
              ?, ?, ?, ?)
    `).run(
      id, setId, content.name, content.type, content.body, content.imageId, metadataColumn(content.metadata),
      setId, userId, userId, now, now,
    );
    return this.require(id);
  }

  update(
    id: string,
    expectedRevision: number,
    content: CardContent,
    userId: string | null,
    now = Date.now(),
  ): LibraryCard {
    this.requireImage(content.imageId);
    const result = this.db.prepare(`
      UPDATE cards
      SET name = ?, type = ?, body = ?, image_id = ?, metadata = ?,
          revision = revision + 1, updated_by = ?, updated_at = ?
      WHERE id = ? AND revision = ?
    `).run(
      content.name, content.type, content.body, content.imageId, metadataColumn(content.metadata),
      userId, now, id, expectedRevision,
    );
    if (result.changes === 0) throw revisionMismatch(this.find(id) !== undefined, "Card");
    return this.require(id);
  }

  setArchived(id: string, archived: boolean, userId: string | null, now = Date.now()): LibraryCard {
    const result = this.db.prepare(`
      UPDATE cards SET archived_at = ?, revision = revision + 1, updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(archived ? now : null, userId, now, id);
    if (result.changes === 0) throw new LibraryError("not_found", "Card not found.");
    return this.require(id);
  }

  private requireImage(imageId: string): void {
    if (!this.db.prepare("SELECT 1 FROM images WHERE id = ?").get(imageId)) {
      throw new LibraryError("invalid", "Upload the card image before saving the card.");
    }
  }

  /** Names of saved decks that still list this card. */
  decksReferencing(cardId: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT decks.name FROM deck_cards
      JOIN decks ON decks.id = deck_cards.deck_id
      WHERE deck_cards.card_id = ?
      ORDER BY decks.name
    `).all(cardId) as { name: string }[];
    return rows.map((row) => row.name);
  }
}
