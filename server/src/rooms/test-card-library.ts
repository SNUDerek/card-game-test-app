import { EventEmitter } from "node:events";
import type { LibraryChange } from "../library/card-library.js";
import type { RoomCardLibrary } from "./TableRoom.js";

/** A fixed set of card ids standing in for the SQLite-backed library in room tests. */
export function fixedCardLibrary(cardIds: readonly string[]): RoomCardLibrary {
  const ids = new Set(cardIds);
  return Object.assign(new EventEmitter<{ changed: [LibraryChange] }>(), {
    activeCardIds: () => ids,
  });
}
