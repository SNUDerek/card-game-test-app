import { randomUUID } from "node:crypto";
import type { DeckEntry, DeckSummary, DeckWithEntries } from "@card-table/shared";
import type { WorkspaceDatabase } from "./connection.js";
import { LibraryError, revisionMismatch } from "../library/errors.js";

interface DeckRow {
  id: string;
  set_id: string;
  name: string;
  description: string;
  revision: number;
  card_count: number;
  updated_at: number;
}

const DECK_SUMMARY_SELECT = `
  SELECT decks.id, decks.set_id, decks.name, decks.description, decks.revision, decks.updated_at,
    (SELECT COALESCE(SUM(copies), 0) FROM deck_cards WHERE deck_cards.deck_id = decks.id) AS card_count
  FROM decks
`;

function mapDeck(row: DeckRow): DeckSummary {
  return {
    id: row.id,
    setId: row.set_id,
    name: row.name,
    description: row.description,
    revision: row.revision,
    cardCount: row.card_count,
    updatedAt: row.updated_at,
  };
}

export interface DeckInput {
  name: string;
  description: string;
  entries: readonly DeckEntry[];
}

/**
 * Saved decks. Every multi-row write runs in one transaction, so a deck's
 * entries are always replaced as a whole.
 */
export class DeckRepository {
  constructor(private readonly db: WorkspaceDatabase) {}

  listBySet(setId: string): DeckSummary[] {
    const rows = this.db.prepare(`${DECK_SUMMARY_SELECT} WHERE decks.set_id = ? ORDER BY decks.name`)
      .all(setId) as DeckRow[];
    return rows.map(mapDeck);
  }

  find(id: string): DeckWithEntries | undefined {
    const row = this.db.prepare(`${DECK_SUMMARY_SELECT} WHERE decks.id = ?`).get(id) as DeckRow | undefined;
    if (!row) return undefined;
    return { ...mapDeck(row), entries: this.entries(id) };
  }

  require(id: string): DeckWithEntries {
    const deck = this.find(id);
    if (!deck) throw new LibraryError("not_found", "Deck not found.");
    return deck;
  }

  /** Entries in the set's card display order. */
  entries(deckId: string): { cardId: string; copies: number }[] {
    return this.db.prepare(`
      SELECT deck_cards.card_id AS cardId, deck_cards.copies
      FROM deck_cards JOIN cards ON cards.id = deck_cards.card_id
      WHERE deck_cards.deck_id = ?
      ORDER BY cards.position, cards.created_at
    `).all(deckId) as { cardId: string; copies: number }[];
  }

  create(setId: string, input: DeckInput, userId: string | null, now = Date.now()): DeckWithEntries {
    if (!this.db.prepare("SELECT 1 FROM card_sets WHERE id = ?").get(setId)) {
      throw new LibraryError("not_found", "Set not found.");
    }
    const id = randomUUID();
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO decks (id, set_id, name, description, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, setId, input.name, input.description, userId, userId, now, now);
      this.insertEntries(id, setId, input.entries);
    })();
    return this.require(id);
  }

  /** Replaces name, description, and every entry, if `expectedRevision` is still current. */
  update(
    id: string,
    expectedRevision: number,
    input: DeckInput,
    userId: string | null,
    now = Date.now(),
  ): DeckWithEntries {
    this.db.transaction(() => {
      const result = this.db.prepare(`
        UPDATE decks
        SET name = ?, description = ?, revision = revision + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND revision = ?
      `).run(input.name, input.description, userId, now, id, expectedRevision);
      if (result.changes === 0) throw revisionMismatch(this.find(id) !== undefined, "Deck");
      const { set_id: setId } = this.db.prepare("SELECT set_id FROM decks WHERE id = ?").get(id) as {
        set_id: string;
      };
      this.db.prepare("DELETE FROM deck_cards WHERE deck_id = ?").run(id);
      this.insertEntries(id, setId, input.entries);
    })();
    return this.require(id);
  }

  delete(id: string): void {
    const result = this.db.prepare("DELETE FROM decks WHERE id = ?").run(id);
    if (result.changes === 0) throw new LibraryError("not_found", "Deck not found.");
  }

  duplicate(id: string, name: string, userId: string | null, now = Date.now()): DeckWithEntries {
    const source = this.require(id);
    return this.create(
      source.setId,
      { name, description: source.description, entries: source.entries },
      userId,
      now,
    );
  }

  /**
   * Checks every entry against the deck's set before inserting: the composite
   * foreign key already refuses another set's card, but this gives a readable
   * message and also refuses archived cards.
   */
  private insertEntries(deckId: string, setId: string, entries: readonly DeckEntry[]): void {
    const findCard = this.db.prepare("SELECT set_id, archived_at, name FROM cards WHERE id = ?");
    const insert = this.db.prepare(
      "INSERT INTO deck_cards (deck_id, set_id, card_id, copies) VALUES (?, ?, ?, ?)",
    );
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.cardId)) {
        throw new LibraryError("invalid", "Each card may appear only once in a deck.");
      }
      seen.add(entry.cardId);
      const card = findCard.get(entry.cardId) as
        | { set_id: string; archived_at: number | null; name: string }
        | undefined;
      if (!card || card.set_id !== setId) {
        throw new LibraryError("invalid", `Card ${entry.cardId} is not in this deck's set.`);
      }
      if (card.archived_at !== null) {
        throw new LibraryError("invalid", `Card "${card.name}" is archived and cannot be added to a deck.`);
      }
      insert.run(deckId, setId, entry.cardId, entry.copies);
    }
  }
}
