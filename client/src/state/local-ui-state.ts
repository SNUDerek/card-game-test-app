import { useCallback, useMemo, useState } from "react";

/**
 * Local-only UI state for the tabletop. Nothing here is sent to the server or
 * derived from room state: it only describes what this client is looking at.
 */

/** Magnification factor for the card preview overlay (spec §7.4 allows 2–4×). */
export const MAGNIFY_SCALE = 2;

export interface LocalUiState {
  /** Card instance id currently shown in the magnified preview, if any. */
  magnifiedCardId: string | null;
  /** Shows the preview for a card. Explicit: nothing magnifies on hover. */
  magnifyCard(cardId: string): void;
  clearMagnifiedCard(): void;
}

export function useLocalUiState(): LocalUiState {
  const [magnifiedCardId, setMagnifiedCardId] = useState<string | null>(null);

  const magnifyCard = useCallback((cardId: string) => setMagnifiedCardId(cardId), []);
  const clearMagnifiedCard = useCallback(() => setMagnifiedCardId(null), []);

  return useMemo(
    () => ({ magnifiedCardId, magnifyCard, clearMagnifiedCard }),
    [magnifiedCardId, magnifyCard, clearMagnifiedCard],
  );
}
