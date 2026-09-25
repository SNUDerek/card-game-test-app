import { useCallback, useMemo, useState } from "react";

/**
 * Local-only UI state for the tabletop. Nothing here is sent to the server or
 * derived from room state: it only describes what this client is looking at.
 */

/** Magnification factor for the card preview overlay (spec §7.4 allows 2–4×). */
export const MAGNIFY_SCALE = 3;

/**
 * Resolves the next magnified card when a card stops being hovered. Leaving a
 * card that is no longer the magnified one (pointer events can arrive out of
 * order) must not dismiss the preview of the card now under the pointer.
 */
export function clearMagnifiedCardId(current: string | null, leftCardId: string): string | null {
  return current === leftCardId ? null : current;
}

export interface LocalUiState {
  /** Card instance id currently shown in the magnified preview, if any. */
  magnifiedCardId: string | null;
  magnifyCard(cardId: string): void;
  unmagnifyCard(cardId: string): void;
  clearMagnifiedCard(): void;
}

export function useLocalUiState(): LocalUiState {
  const [magnifiedCardId, setMagnifiedCardId] = useState<string | null>(null);

  const magnifyCard = useCallback((cardId: string) => setMagnifiedCardId(cardId), []);

  const unmagnifyCard = useCallback((cardId: string) => {
    setMagnifiedCardId((current) => clearMagnifiedCardId(current, cardId));
  }, []);

  const clearMagnifiedCard = useCallback(() => setMagnifiedCardId(null), []);

  return useMemo(
    () => ({ magnifiedCardId, magnifyCard, unmagnifyCard, clearMagnifiedCard }),
    [magnifiedCardId, magnifyCard, unmagnifyCard, clearMagnifiedCard],
  );
}
