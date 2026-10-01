import type { CardSet, DeckWithEntries } from "@card-table/shared";
import type { CardDefinitionLookup } from "../commands/card/spawn-card.js";
import type { LibraryChange } from "../library/card-library.js";
import type { SetUsageRegistry } from "../library/set-usage.js";

export interface RoomCardLibrary {
  activeCardIds(setId: string): CardDefinitionLookup;
  requireActiveSet(setId: string): CardSet;
  on(event: "changed", listener: (change: LibraryChange) => void): unknown;
  off(event: "changed", listener: (change: LibraryChange) => void): unknown;
}

export interface RoomDeckLookup { getDeck(deckId: string): DeckWithEntries }

/** Owns the one set binding a room has for its entire lifetime. */
export class RoomLibraryBinding {
  readonly cardIds: CardDefinitionLookup;
  readonly set: CardSet;

  constructor(
    readonly setId: string,
    private readonly library: RoomCardLibrary,
    private readonly usage: SetUsageRegistry | undefined,
    private readonly roomId: string,
  ) {
    // Both checks are synchronous: an archive request cannot slip between them.
    this.set = library.requireActiveSet(setId);
    usage?.acquire(setId, roomId);
    this.cardIds = library.activeCardIds(setId);
  }

  onChanged(listener: (change: LibraryChange) => void): void { this.library.on("changed", listener); }
  currentSet(): CardSet { return this.library.requireActiveSet(this.setId); }
  dispose(listener: (change: LibraryChange) => void): void {
    this.library.off("changed", listener);
    this.usage?.release(this.roomId);
  }
}
