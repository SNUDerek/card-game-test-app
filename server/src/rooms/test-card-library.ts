import { EventEmitter } from "node:events";
import type { LibraryChange } from "../library/card-library.js";
import type { RoomCardLibrary } from "./library-binding.js";

/** A fixed set of card ids standing in for the SQLite-backed library in room tests. */
export function fixedCardLibrary(cardIds: readonly string[]): RoomCardLibrary {
  const ids = new Set(cardIds);
  return Object.assign(new EventEmitter<{ changed: [LibraryChange] }>(), {
    activeCardIds: () => ids,
    requireActiveSet: (setId: string) => ({ id: setId, name: "Test set", description: "", forkedFromSetId: null, revision: 1, archived: false, createdAt: 0, updatedAt: 0 }),
  });
}
