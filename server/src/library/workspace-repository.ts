import { randomUUID } from "node:crypto";
import type {
  CreateCardRequest, CreateDeckRequest, CreateSetRequest, DeckEntry,
  UpdateCardRequest, UpdateDeckRequest, UpdateSetRequest,
} from "@card-table/shared";
import type { WorkspaceDatabase } from "../db/connection.js";
import type { SetExportSnapshot } from "./export-set.js";

export class WorkspaceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export interface CardSetRecord {
  id: string;
  name: string;
  description: string;
  forkedFromSetId: string | null;
  revision: number;
  archived: boolean;
  cardCount: number;
  deckCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CardRecord {
  id: string;
  setId: string;
  name: string;
  type: string;
  body: string;
  imageId: string;
  imageUrl: string;
  metadata?: Record<string, unknown>;
  position: number;
  revision: number;
  archived: boolean;
}

export interface DeckRecord {
  id: string;
  setId: string;
  name: string;
  description: string;
  revision: number;
  entries: DeckEntry[];
  createdAt: number;
  updatedAt: number;
}

interface SetRow {
  id: string; name: string; description: string; forked_from_set_id: string | null;
  revision: number; archived_at: number | null; created_at: number; updated_at: number;
  card_count?: number; deck_count?: number;
}
interface CardRow {
  id: string; set_id: string; name: string; type: string; body: string; image_id: string;
  metadata: string | null; position: number; revision: number; archived_at: number | null;
}
interface DeckRow {
  id: string; set_id: string; name: string; description: string; revision: number;
  created_at: number; updated_at: number;
}

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkspaceError(500, "Stored card metadata is invalid.");
  }
  return parsed as Record<string, unknown>;
}

function mapSet(row: SetRow): CardSetRecord {
  return {
    id: row.id, name: row.name, description: row.description,
    forkedFromSetId: row.forked_from_set_id, revision: row.revision,
    archived: row.archived_at !== null, cardCount: row.card_count ?? 0,
    deckCount: row.deck_count ?? 0, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapCard(row: CardRow): CardRecord {
  return {
    id: row.id, setId: row.set_id, name: row.name, type: row.type, body: row.body,
    imageId: row.image_id, imageUrl: `/images/${row.image_id}`,
    ...(row.metadata ? { metadata: parseMetadata(row.metadata) } : {}),
    position: row.position, revision: row.revision, archived: row.archived_at !== null,
  };
}

export class WorkspaceRepository {
  constructor(private readonly db: WorkspaceDatabase) {}

  listSets(includeArchived = false): CardSetRecord[] {
    return (this.db.prepare(`
      SELECT s.*,
        (SELECT count(*) FROM cards c WHERE c.set_id = s.id AND c.archived_at IS NULL) card_count,
        (SELECT count(*) FROM decks d WHERE d.set_id = s.id) deck_count
      FROM card_sets s ${includeArchived ? "" : "WHERE s.archived_at IS NULL"}
      ORDER BY s.updated_at DESC, s.name COLLATE NOCASE
    `).all() as SetRow[]).map(mapSet);
  }

  getSet(id: string, includeArchived = false): CardSetRecord {
    const row = this.db.prepare(`
      SELECT s.*,
        (SELECT count(*) FROM cards c WHERE c.set_id = s.id AND c.archived_at IS NULL) card_count,
        (SELECT count(*) FROM decks d WHERE d.set_id = s.id) deck_count
      FROM card_sets s WHERE s.id = ? ${includeArchived ? "" : "AND s.archived_at IS NULL"}
    `).get(id) as SetRow | undefined;
    if (!row) throw new WorkspaceError(404, "Set not found.");
    return mapSet(row);
  }

  createSet(input: CreateSetRequest, userId: string): CardSetRecord {
    const now = Date.now();
    const id = randomUUID();
    this.db.prepare(`INSERT INTO card_sets
      (id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, input.name, input.description, userId, now, now);
    return this.getSet(id, true);
  }

  updateSet(id: string, input: UpdateSetRequest): CardSetRecord {
    const current = this.getSet(id, true);
    const stored = this.db.prepare("SELECT archived_at archivedAt FROM card_sets WHERE id = ?")
      .get(id) as { archivedAt: number | null };
    const archivedAt = input.archived === undefined ? stored.archivedAt : input.archived ? Date.now() : null;
    const result = this.db.prepare(`UPDATE card_sets SET name = ?, description = ?, archived_at = ?,
      revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?`)
      .run(input.name ?? current.name, input.description ?? current.description, archivedAt, Date.now(), id, input.revision);
    if (!result.changes) throw new WorkspaceError(409, "Set has changed; reload and try again.");
    return this.getSet(id, true);
  }

  archiveSet(id: string): void {
    this.getSet(id, true);
    this.db.prepare("UPDATE card_sets SET archived_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
      .run(Date.now(), Date.now(), id);
  }

  listCards(setId: string, includeArchived = false): CardRecord[] {
    this.getSet(setId, true);
    return (this.db.prepare(`SELECT * FROM cards WHERE set_id = ? ${includeArchived ? "" : "AND archived_at IS NULL"}
      ORDER BY position, name COLLATE NOCASE`).all(setId) as CardRow[]).map(mapCard);
  }

  getCard(id: string, includeArchived = false): CardRecord {
    const row = this.db.prepare(`SELECT * FROM cards WHERE id = ? ${includeArchived ? "" : "AND archived_at IS NULL"}`)
      .get(id) as CardRow | undefined;
    if (!row) throw new WorkspaceError(404, "Card not found.");
    return mapCard(row);
  }

  createCard(setId: string, input: CreateCardRequest, userId: string): CardRecord {
    this.getSet(setId);
    this.requireImage(input.imageId);
    const id = randomUUID();
    const now = Date.now();
    const position = input.position ?? ((this.db.prepare("SELECT coalesce(max(position), -1) + 1 value FROM cards WHERE set_id = ?")
      .get(setId) as { value: number }).value);
    this.db.prepare(`INSERT INTO cards
      (id, set_id, name, type, body, image_id, metadata, position, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, setId, input.name, input.type, input.body, input.imageId,
        input.metadata ? JSON.stringify(input.metadata) : null, position, userId, userId, now, now);
    return this.getCard(id, true);
  }

  updateCard(id: string, input: UpdateCardRequest, userId: string): CardRecord {
    const current = this.getCard(id);
    this.requireImage(input.imageId);
    const result = this.db.prepare(`UPDATE cards SET name = ?, type = ?, body = ?, image_id = ?, metadata = ?,
      position = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ? AND revision = ? AND archived_at IS NULL`)
      .run(input.name, input.type, input.body, input.imageId, input.metadata ? JSON.stringify(input.metadata) : null,
        input.position ?? current.position, userId, Date.now(), id, input.revision);
    if (!result.changes) throw new WorkspaceError(409, "Card has changed; reload and try again.");
    return this.getCard(id, true);
  }

  archiveCard(id: string): void {
    const card = this.getCard(id);
    const decks = this.db.prepare(`SELECT d.name FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.card_id = ?`)
      .all(id) as { name: string }[];
    if (decks.length) throw new WorkspaceError(409, `Card is used by decks: ${decks.map((deck) => deck.name).join(", ")}.`);
    this.db.prepare("UPDATE cards SET archived_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
      .run(Date.now(), Date.now(), card.id);
  }

  listDecks(setId: string): DeckRecord[] {
    this.getSet(setId, true);
    return (this.db.prepare("SELECT * FROM decks WHERE set_id = ? ORDER BY name COLLATE NOCASE").all(setId) as DeckRow[])
      .map((row) => this.mapDeck(row));
  }

  getDeck(id: string): DeckRecord {
    const row = this.db.prepare("SELECT * FROM decks WHERE id = ?").get(id) as DeckRow | undefined;
    if (!row) throw new WorkspaceError(404, "Deck not found.");
    return this.mapDeck(row);
  }

  private mapDeck(row: DeckRow): DeckRecord {
    const entries = this.db.prepare("SELECT card_id cardId, copies FROM deck_cards WHERE deck_id = ? ORDER BY card_id")
      .all(row.id) as DeckEntry[];
    return { id: row.id, setId: row.set_id, name: row.name, description: row.description,
      revision: row.revision, entries, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private validateEntries(setId: string, entries: DeckEntry[]): void {
    if (new Set(entries.map((entry) => entry.cardId)).size !== entries.length) {
      throw new WorkspaceError(400, "Deck entries contain duplicate card IDs.");
    }
    const check = this.db.prepare("SELECT 1 FROM cards WHERE id = ? AND set_id = ? AND archived_at IS NULL");
    for (const entry of entries) if (!check.get(entry.cardId, setId)) {
      throw new WorkspaceError(400, `Card ${entry.cardId} does not belong to this set.`);
    }
  }

  createDeck(setId: string, input: CreateDeckRequest, userId: string): DeckRecord {
    this.getSet(setId);
    this.validateEntries(setId, input.entries);
    const id = randomUUID();
    const now = Date.now();
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO decks (id, set_id, name, description, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, setId, input.name, input.description, userId, userId, now, now);
      const insert = this.db.prepare("INSERT INTO deck_cards (deck_id, set_id, card_id, copies) VALUES (?, ?, ?, ?)");
      for (const entry of input.entries) insert.run(id, setId, entry.cardId, entry.copies);
    })();
    return this.getDeck(id);
  }

  updateDeck(id: string, input: UpdateDeckRequest, userId: string): DeckRecord {
    const deck = this.getDeck(id);
    this.validateEntries(deck.setId, input.entries);
    this.db.transaction(() => {
      const result = this.db.prepare(`UPDATE decks SET name = ?, description = ?, revision = revision + 1,
        updated_by = ?, updated_at = ? WHERE id = ? AND revision = ?`)
        .run(input.name, input.description, userId, Date.now(), id, input.revision);
      if (!result.changes) throw new WorkspaceError(409, "Deck has changed; reload and try again.");
      this.db.prepare("DELETE FROM deck_cards WHERE deck_id = ?").run(id);
      const insert = this.db.prepare("INSERT INTO deck_cards (deck_id, set_id, card_id, copies) VALUES (?, ?, ?, ?)");
      for (const entry of input.entries) insert.run(id, deck.setId, entry.cardId, entry.copies);
    })();
    return this.getDeck(id);
  }

  deleteDeck(id: string): void {
    if (!this.db.prepare("DELETE FROM decks WHERE id = ?").run(id).changes) throw new WorkspaceError(404, "Deck not found.");
  }

  duplicateDeck(id: string, name: string | undefined, userId: string): DeckRecord {
    const source = this.getDeck(id);
    return this.createDeck(source.setId, { name: name ?? `${source.name} copy`, description: source.description, entries: source.entries }, userId);
  }

  forkSet(sourceId: string, name: string, userId: string): CardSetRecord {
    const source = this.getSet(sourceId);
    let targetId = "";
    this.db.transaction(() => {
      const now = Date.now();
      targetId = randomUUID();
      this.db.prepare(`INSERT INTO card_sets
        (id, name, description, forked_from_set_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(targetId, name, source.description, sourceId, userId, now, now);
      const cardMap = new Map<string, string>();
      for (const card of this.listCards(sourceId)) {
        const newId = randomUUID(); cardMap.set(card.id, newId);
        this.db.prepare(`INSERT INTO cards (id, set_id, name, type, body, image_id, metadata, position, created_by, updated_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(newId, targetId, card.name, card.type, card.body, card.imageId,
            card.metadata ? JSON.stringify(card.metadata) : null, card.position, userId, userId, now, now);
      }
      for (const deck of this.listDecks(sourceId)) {
        this.createDeck(targetId, { name: deck.name, description: deck.description,
          entries: deck.entries.map((entry) => ({ cardId: cardMap.get(entry.cardId)!, copies: entry.copies })) }, userId);
      }
    })();
    return this.getSet(targetId);
  }

  exportSnapshot(setId: string): SetExportSnapshot {
    return this.db.transaction(() => {
      const set = this.getSet(setId);
      const cards = this.listCards(setId);
      const decks = this.listDecks(setId);
      const images = new Map<string, { mime: string }>();
      const query = this.db.prepare("SELECT mime FROM images WHERE id = ?");
      for (const card of cards) {
        const row = query.get(card.imageId) as { mime: string } | undefined;
        if (!row) throw new WorkspaceError(500, `Image ${card.imageId} is missing.`);
        images.set(card.imageId, row);
      }
      return {
        set: { name: set.name, description: set.description },
        cards: cards.map((card) => ({ id: card.id, name: card.name, type: card.type, body: card.body,
          imageId: card.imageId, metadata: card.metadata, position: card.position })),
        decks: decks.map((deck) => ({ id: deck.id, name: deck.name, description: deck.description, entries: deck.entries })),
        images,
      };
    })();
  }

  private requireImage(id: string): void {
    if (!this.db.prepare("SELECT 1 FROM images WHERE id = ?").get(id)) throw new WorkspaceError(400, "Image not found.");
  }
}
