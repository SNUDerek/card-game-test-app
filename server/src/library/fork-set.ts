import { randomUUID } from "node:crypto";
import type { CardSet } from "@card-table/shared";
import type { WorkspaceDatabase } from "../db/connection.js";
import { SetRepository } from "../db/sets.js";
import { LibraryError } from "./errors.js";

/**
 * Deep-copies a set into a new, independent set in one transaction: every
 * non-archived card gets a new id but keeps its image, content, and order, and
 * every deck is copied with its entries remapped to the new card ids.
 * Rooms are not copied.
 */
export function forkSet(
  db: WorkspaceDatabase,
  sourceSetId: string,
  name: string,
  userId: string | null,
  now = Date.now(),
): CardSet {
  const sets = new SetRepository(db);
  return db.transaction(() => {
    const source = sets.find(sourceSetId);
    if (!source) throw new LibraryError("not_found", "Set not found.");
    const fork = sets.create(
      { name, description: source.description, forkedFromSetId: source.id },
      userId,
      now,
    );

    const sourceCards = db.prepare(`
      SELECT id, name, type, body, image_id, metadata, position
      FROM cards WHERE set_id = ? AND archived_at IS NULL
      ORDER BY position, created_at
    `).all(source.id) as {
      id: string;
      name: string;
      type: string;
      body: string;
      image_id: string;
      metadata: string | null;
      position: number;
    }[];
    const insertCard = db.prepare(`
      INSERT INTO cards (id, set_id, name, type, body, image_id, metadata, position,
                         created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const newCardIds = new Map<string, string>();
    for (const card of sourceCards) {
      const id = randomUUID();
      newCardIds.set(card.id, id);
      insertCard.run(
        id, fork.id, card.name, card.type, card.body, card.image_id, card.metadata, card.position,
        userId, userId, now, now,
      );
    }

    const sourceDecks = db.prepare("SELECT id, name, description FROM decks WHERE set_id = ?")
      .all(source.id) as { id: string; name: string; description: string }[];
    const sourceEntries = db.prepare("SELECT card_id, copies FROM deck_cards WHERE deck_id = ?");
    const insertDeck = db.prepare(`
      INSERT INTO decks (id, set_id, name, description, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEntry = db.prepare(
      "INSERT INTO deck_cards (deck_id, set_id, card_id, copies) VALUES (?, ?, ?, ?)",
    );
    for (const deck of sourceDecks) {
      const deckId = randomUUID();
      insertDeck.run(deckId, fork.id, deck.name, deck.description, userId, userId, now, now);
      for (const entry of sourceEntries.all(deck.id) as { card_id: string; copies: number }[]) {
        // Saved decks never reference archived cards, so every entry has a copy.
        const cardId = newCardIds.get(entry.card_id);
        if (!cardId) throw new LibraryError("conflict", `Deck "${deck.name}" references an archived card.`);
        insertEntry.run(deckId, fork.id, cardId, entry.copies);
      }
    }
    return fork;
  })();
}
