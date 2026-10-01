import { useEffect, useState } from "react";
import type { DeckSummary, SpawnDeckPayload } from "@card-table/shared";
import { apiRequest } from "../../api/client";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import { DEFAULT_VIEWPORT, screenToWorld, type Point } from "../../tabletop/viewport";
import { errorMessage } from "../sets/errors";
import { DeckListResponseSchema, generateDeck } from "../sets/decks/deck-api";

/** Decks land where the player is looking: the centre of the visible table. */
function visibleTableCentre(): Point {
  return screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, DEFAULT_VIEWPORT);
}

type DealSource =
  | { source: "deck"; deckId: string }
  | { source: "entries"; entries: Extract<SpawnDeckPayload, { source: "entries" }>["entries"] };

/** Deals a saved or freshly generated deck onto the table, face down and shuffled. */
export function DeckDealPanel({ hasCards }: { hasCards: boolean }) {
  const { setId, spawnDeck } = useMultiplayer();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [size, setSize] = useState(40);
  const [maxCopies, setMaxCopies] = useState(4);
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paramsValid = Number.isInteger(size) && size >= 1 && Number.isInteger(maxCopies) && maxCopies >= 1;

  useEffect(() => {
    if (!setId) return;
    apiRequest(`/api/sets/${setId}/decks`, DeckListResponseSchema)
      .then((body) => setDecks(body.decks))
      .catch((cause: unknown) => setError(errorMessage(cause, "Could not load decks.")));
  }, [setId]);

  async function deal(load: () => Promise<DealSource>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      const source = await load();
      await spawnDeck({ ...source, ...visibleTableCentre(), shuffle: true, face: "back" });
    } catch (cause: unknown) {
      setError(errorMessage(cause, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deck-deal-panel">
      {error && <p className="card-browser-error" role="alert">{error}</p>}

      <h3>Saved decks</h3>
      {decks.map((deck) => (
        <button key={deck.id} type="button" disabled={busy}
          onClick={() => void deal(async () => ({ source: "deck", deckId: deck.id }), "Could not deal deck.")}>
          Deal {deck.name} ({deck.cardCount})
        </button>
      ))}
      {decks.length === 0 && <p>No saved decks.</p>}

      <h3>Generate &amp; deal</h3>
      <label>
        Size
        <input type="number" min="1" value={Number.isNaN(size) ? "" : size}
          onChange={(event) => setSize(event.target.valueAsNumber)} />
      </label>
      <label>
        Max copies
        <input type="number" min="1" value={Number.isNaN(maxCopies) ? "" : maxCopies}
          onChange={(event) => setMaxCopies(event.target.valueAsNumber)} />
      </label>
      <label>
        Seed
        <input value={seed} maxLength={64} onChange={(event) => setSeed(event.target.value)} />
      </label>
      <button type="button" disabled={busy || !hasCards || !paramsValid}
        onClick={() => void deal(async () => {
          const generated = await generateDeck(setId, { size, maxCopies, seed });
          return { source: "entries", entries: generated.entries };
        }, "Could not generate deck.")}>
        Generate &amp; deal
      </button>
    </div>
  );
}
