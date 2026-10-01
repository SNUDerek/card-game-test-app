import { EventEmitter } from "node:events";
import type { CardContent, CardSet, LibraryCard } from "@card-table/shared";
import type { WorkspaceDatabase } from "../db/connection.js";
import { CardRepository } from "../db/cards.js";
import { SetRepository } from "../db/sets.js";
import { LibraryError } from "./errors.js";

/** One write to a set or its cards. Live rooms bound to `setId` relay it to their players. */
export interface LibraryChange {
  setId: string;
  /** Cards created, edited, archived, or restored. Empty for set-only edits. */
  cardIds: string[];
  /** Who made the change, so tables can say "Alice edited Fireball". */
  userId: string | null;
}

/** The only membership test rooms need, matching `ReadonlySet#has`. */
export interface CardIdLookup {
  has(cardId: string): boolean;
}

/**
 * In-memory cache of card definitions with write-through to SQLite. Rooms ask
 * "does this card exist in my set?" synchronously, so every card write goes
 * through here and the cache can never lag the database.
 *
 * Sets load lazily on first use, so sets created behind the cache's back (by
 * the importer CLI, or by a fork) are picked up without a restart. The importer
 * only ever creates new sets, so it cannot leave a loaded set stale.
 *
 * Usage locks are the caller's concern: check the usage registry and then call
 * the archiving method, with no `await` between them.
 */
export class CardLibrary extends EventEmitter<{ changed: [LibraryChange] }> {
  private readonly sets: SetRepository;
  private readonly cards: CardRepository;
  private readonly cardsBySet = new Map<string, Map<string, LibraryCard>>();

  constructor(db: WorkspaceDatabase) {
    super();
    this.sets = new SetRepository(db);
    this.cards = new CardRepository(db);
  }

  /** Every card of a set in display order; archived cards only when asked for. */
  cardsInSet(setId: string, options: { includeArchived?: boolean } = {}): LibraryCard[] {
    const cards = [...this.loadSet(setId).values()];
    return options.includeArchived ? cards : cards.filter((card) => !card.archived);
  }

  getCard(cardId: string): LibraryCard | undefined {
    for (const cards of this.cardsBySet.values()) {
      const card = cards.get(cardId);
      if (card) return card;
    }
    const stored = this.cards.find(cardId);
    return stored ? this.loadSet(stored.setId).get(cardId) : undefined;
  }

  hasActiveCard(setId: string, cardId: string): boolean {
    const card = this.loadSet(setId).get(cardId);
    return card !== undefined && !card.archived;
  }

  /** A live view of a set's active card ids for command validation; it sees later edits. */
  activeCardIds(setId: string): CardIdLookup {
    return { has: (cardId) => this.hasActiveCard(setId, cardId) };
  }

  createCard(setId: string, content: CardContent, userId: string | null): LibraryCard {
    const set = this.sets.require(setId);
    if (set.archived) throw new LibraryError("conflict", "Restore this set before adding cards to it.");
    return this.remember(this.cards.create(setId, content, userId), userId);
  }

  updateCard(cardId: string, expectedRevision: number, content: CardContent, userId: string | null): LibraryCard {
    return this.remember(this.cards.update(cardId, expectedRevision, content, userId), userId);
  }

  /** Soft-deletes a card. Refused while a saved deck still lists it. */
  archiveCard(cardId: string, userId: string | null): LibraryCard {
    this.cards.require(cardId);
    const decks = this.cards.decksReferencing(cardId);
    if (decks.length > 0) {
      throw new LibraryError(
        "conflict",
        `Remove this card from ${decks.length === 1 ? "deck" : "decks"} ${decks.map((name) => `"${name}"`).join(", ")} first.`,
      );
    }
    return this.remember(this.cards.setArchived(cardId, true, userId), userId);
  }

  restoreCard(cardId: string, userId: string | null): LibraryCard {
    return this.remember(this.cards.setArchived(cardId, false, userId), userId);
  }

  /** Edits a set's name or description; tables are told so they can refresh. */
  updateSet(
    setId: string,
    expectedRevision: number,
    changes: { name?: string; description?: string },
    userId: string | null,
  ): CardSet {
    const set = this.sets.update(setId, expectedRevision, changes);
    this.emit("changed", { setId, cardIds: [], userId });
    return set;
  }

  private loadSet(setId: string): Map<string, LibraryCard> {
    let cards = this.cardsBySet.get(setId);
    if (!cards) {
      cards = new Map(this.cards.listBySet(setId).map((card) => [card.id, card]));
      this.cardsBySet.set(setId, cards);
    }
    return cards;
  }

  private remember(card: LibraryCard, userId: string | null): LibraryCard {
    // Edits keep their Map slot and new cards take the next position, so the
    // Map stays in display order.
    this.loadSet(card.setId).set(card.id, card);
    this.emit("changed", { setId: card.setId, cardIds: [card.id], userId });
    return card;
  }
}
