import { randomUUID } from "node:crypto";
import type { CardSet, CardSetSummary } from "@card-table/shared";
import type { WorkspaceDatabase } from "./connection.js";
import { LibraryError, revisionMismatch } from "../library/errors.js";

interface SetRow {
  id: string;
  name: string;
  description: string;
  forked_from_set_id: string | null;
  revision: number;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

interface SetSummaryRow extends SetRow {
  forked_from_set_name: string | null;
  card_count: number;
  deck_count: number;
}

const SET_COLUMNS = `
  card_sets.id, card_sets.name, card_sets.description, card_sets.forked_from_set_id,
  card_sets.revision, card_sets.archived_at, card_sets.created_at, card_sets.updated_at
`;

function mapSet(row: SetRow): CardSet {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    forkedFromSetId: row.forked_from_set_id,
    revision: row.revision,
    archived: row.archived_at !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SetRepository {
  constructor(private readonly db: WorkspaceDatabase) {}

  create(
    input: { name: string; description?: string; forkedFromSetId?: string },
    userId: string | null,
    now = Date.now(),
  ): CardSet {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO card_sets (id, name, description, forked_from_set_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.description ?? "", input.forkedFromSetId ?? null, userId, now, now);
    return this.require(id);
  }

  find(id: string): CardSet | undefined {
    const row = this.db.prepare(`SELECT ${SET_COLUMNS} FROM card_sets WHERE id = ?`).get(id) as
      | SetRow
      | undefined;
    return row ? mapSet(row) : undefined;
  }

  require(id: string): CardSet {
    const set = this.find(id);
    if (!set) throw new LibraryError("not_found", "Set not found.");
    return set;
  }

  /** Sets for the set list, newest first. Archived sets are hidden unless asked for. */
  list(options: { includeArchived?: boolean } = {}): CardSetSummary[] {
    const rows = this.db.prepare(`
      SELECT ${SET_COLUMNS},
        parent.name AS forked_from_set_name,
        (SELECT COUNT(*) FROM cards WHERE cards.set_id = card_sets.id AND cards.archived_at IS NULL) AS card_count,
        (SELECT COUNT(*) FROM decks WHERE decks.set_id = card_sets.id) AS deck_count
      FROM card_sets
      LEFT JOIN card_sets AS parent ON parent.id = card_sets.forked_from_set_id
      WHERE ? OR card_sets.archived_at IS NULL
      ORDER BY card_sets.created_at DESC, card_sets.name
    `).all(options.includeArchived ? 1 : 0) as SetSummaryRow[];
    return rows.map((row) => ({
      ...mapSet(row),
      forkedFromSetName: row.forked_from_set_name,
      cardCount: row.card_count,
      deckCount: row.deck_count,
    }));
  }

  update(
    id: string,
    expectedRevision: number,
    changes: { name?: string; description?: string },
    now = Date.now(),
  ): CardSet {
    const result = this.db.prepare(`
      UPDATE card_sets
      SET name = COALESCE(?, name), description = COALESCE(?, description),
          revision = revision + 1, updated_at = ?
      WHERE id = ? AND revision = ?
    `).run(changes.name ?? null, changes.description ?? null, now, id, expectedRevision);
    if (result.changes === 0) throw revisionMismatch(this.find(id) !== undefined, "Set");
    return this.require(id);
  }

  /**
   * Archives or restores a set. Whether a live room is using it is checked by
   * the caller, synchronously, right before this.
   */
  setArchived(id: string, archived: boolean, now = Date.now()): CardSet {
    const result = this.db.prepare(`
      UPDATE card_sets SET archived_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?
    `).run(archived ? now : null, now, id);
    if (result.changes === 0) throw new LibraryError("not_found", "Set not found.");
    return this.require(id);
  }
}
