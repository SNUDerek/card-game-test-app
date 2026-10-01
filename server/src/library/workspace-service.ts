import type {
  CardSetSummary, CreateCardSetRequest, DeckEntry, LibraryCard, SaveDeckRequest,
  UpdateCardSetRequest, UpdateDeckRequest,
} from "@card-table/shared";
import type { WorkspaceDatabase } from "../db/connection.js";
import { CardRepository } from "../db/cards.js";
import { DeckRepository } from "../db/decks.js";
import { SetRepository } from "../db/sets.js";
import { CardLibrary } from "./card-library.js";
import type { SetExportSnapshot } from "./export-set.js";
import { forkSet } from "./fork-set.js";
import type { ImageStore } from "./image-store.js";
import { LibraryError } from "./errors.js";
import type { SetUsageRegistry } from "./set-usage.js";

/** Thin route-facing facade over the canonical §8.2 repositories and cache. */
export class WorkspaceService {
  readonly sets: SetRepository;
  readonly cards: CardRepository;
  readonly decks: DeckRepository;
  readonly cardLibrary: CardLibrary;

  constructor(
    private readonly db: WorkspaceDatabase,
    private readonly images: ImageStore,
    private readonly usage?: SetUsageRegistry,
  ) {
    this.sets = new SetRepository(db);
    this.cards = new CardRepository(db);
    this.decks = new DeckRepository(db);
    this.cardLibrary = new CardLibrary(db, this.sets, this.cards);
  }

  listSets(includeArchived = false): CardSetSummary[] {
    return this.sets.list({ includeArchived });
  }

  setSummary(id: string): CardSetSummary {
    const summary = this.sets.list({ includeArchived: true }).find((set) => set.id === id);
    if (!summary) throw new LibraryError("not_found", "Set not found.");
    return summary;
  }

  createSet(input: CreateCardSetRequest, userId: string) {
    return this.sets.create(input, userId);
  }

  updateSet(id: string, input: UpdateCardSetRequest & { archived?: boolean }, userId: string) {
    return this.db.transaction(() => {
      let set = this.sets.require(id);
      if (set.revision !== input.revision) {
        throw new LibraryError("stale_revision", "Set has changed; reload and try again.");
      }
      if (input.name !== undefined || input.description !== undefined) {
        set = this.cardLibrary.updateSet(id, set.revision, { name: input.name, description: input.description }, userId);
      }
      if (input.archived !== undefined && input.archived !== set.archived) {
        if (input.archived) this.requireUnused(id);
        set = this.cardLibrary.setArchived(id, input.archived, userId);
      }
      return set;
    })();
  }

  archiveSet(id: string, userId: string) {
    this.requireUnused(id);
    return this.cardLibrary.setArchived(id, true, userId);
  }
  forkSet(id: string, name: string, userId: string) { return forkSet(this.db, id, name, userId); }

  listCards(setId: string, includeArchived = false): LibraryCard[] {
    this.sets.require(setId);
    return this.cardLibrary.cardsInSet(setId, { includeArchived });
  }

  createCard(setId: string, input: Parameters<CardLibrary["createCard"]>[1], userId: string) {
    return this.cardLibrary.createCard(setId, input, userId);
  }

  updateCard(id: string, input: Parameters<CardLibrary["updateCard"]>[2] & { revision: number }, userId: string) {
    const { revision, ...content } = input;
    return this.cardLibrary.updateCard(id, revision, content, userId);
  }

  archiveCard(id: string, userId: string) {
    const card = this.cards.require(id);
    this.requireUnused(card.setId);
    return this.cardLibrary.archiveCard(id, userId);
  }

  restoreCard(id: string, userId: string) {
    const card = this.cards.require(id);
    this.requireActiveSet(card.setId, "restoring its cards");
    return this.cardLibrary.restoreCard(id, userId);
  }

  listDecks(setId: string) {
    this.sets.require(setId);
    return this.decks.listBySet(setId);
  }

  getDeck(id: string) { return this.decks.require(id); }
  createDeck(setId: string, input: SaveDeckRequest, userId: string) {
    this.requireActiveSet(setId, "creating a deck");
    return this.decks.create(setId, input, userId);
  }
  updateDeck(id: string, input: UpdateDeckRequest, userId: string) {
    const { revision, ...content } = input;
    return this.decks.update(id, revision, content, userId);
  }
  deleteDeck(id: string) { return this.decks.delete(id); }
  duplicateDeck(id: string, name: string | undefined, userId: string) {
    const source = this.decks.require(id);
    this.requireActiveSet(source.setId, "duplicating a deck");
    return this.decks.duplicate(id, name ?? `${source.name} copy`, userId);
  }

  exportSnapshot(setId: string): SetExportSnapshot {
    return this.db.transaction(() => {
      const set = this.sets.require(setId);
      if (set.archived) throw new LibraryError("not_found", "Set not found.");
      const cards = this.cardLibrary.cardsInSet(setId);
      const decks = this.decks.listBySet(setId).map((deck) => this.decks.require(deck.id));
      const images = new Map<string, { mime: string }>();
      for (const card of cards) {
        const image = this.images.find(card.imageId);
        if (!image) throw new LibraryError("not_found", `Image ${card.imageId} not found.`);
        images.set(card.imageId, image);
      }
      return {
        set: { name: set.name, description: set.description },
        cards: cards.map((card) => ({
          id: card.id, name: card.name, type: card.type, body: card.body,
          imageId: card.imageId, metadata: card.metadata, position: card.position,
        })),
        decks: decks.map((deck) => ({
          id: deck.id, name: deck.name, description: deck.description,
          entries: deck.entries as DeckEntry[],
        })),
        images,
      };
    })();
  }

  private requireUnused(setId: string): void {
    const rooms = this.usage?.roomsUsing(setId) ?? [];
    if (rooms.length) throw new LibraryError("in_use", `Set is in use by rooms: ${rooms.join(", ")}.`);
  }

  private requireActiveSet(setId: string, action: string): void {
    if (this.sets.require(setId).archived) {
      throw new LibraryError("conflict", `Restore this set before ${action}.`);
    }
  }
}
