import { useCallback, useEffect, useState } from "react";
import type { CardDefinition, DeckSummary } from "@card-table/shared";
import { apiRequest } from "../../../api/client";
import { errorMessage } from "../errors";
import { DeckEditor } from "./DeckEditor";
import { DeckGeneratorDialog } from "./DeckGeneratorDialog";
import { DeckListResponseSchema } from "./deck-api";

/** `undefined` while no editor is open; `null` while creating a new deck. */
type EditingDeck = string | null | undefined;

/** A set's saved decks, with the editor and generator that add to them. */
export function DeckList({ setId, cards }: { setId: string; cards: CardDefinition[] }) {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [editing, setEditing] = useState<EditingDeck>(undefined);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDecks((await apiRequest(`/api/sets/${setId}/decks`, DeckListResponseSchema)).decks);
      setError(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Could not load decks."));
    }
  }, [setId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label="Decks">
      <div className="card-controls">
        <button type="button" onClick={() => setEditing(null)}>New deck</button>
        <button type="button" disabled={cards.length === 0} onClick={() => setGenerating(true)}>
          Generate deck
        </button>
      </div>
      {error && <p className="workspace-error" role="alert">{error}</p>}
      <div className="set-list">
        {decks.map((deck) => (
          <article className="set-row" key={deck.id}>
            <div>
              <strong>{deck.name}</strong>
              <p>{deck.description || "No description"}</p>
              <small>{deck.cardCount} cards</small>
            </div>
            <button type="button" aria-label={`Edit ${deck.name}`} onClick={() => setEditing(deck.id)}>
              Edit
            </button>
          </article>
        ))}
        {decks.length === 0 && <p className="workspace-muted">No decks yet.</p>}
      </div>

      {editing !== undefined && (
        <DeckEditor
          setId={setId}
          deckId={editing}
          cards={cards}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
          }}
        />
      )}
      {generating && (
        <DeckGeneratorDialog
          setId={setId}
          cards={cards}
          onClose={() => setGenerating(false)}
          onSaved={() => {
            setGenerating(false);
            void load();
          }}
        />
      )}
    </section>
  );
}
