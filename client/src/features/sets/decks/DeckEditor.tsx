import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  DECK_NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  MAX_DECK_ENTRY_COPIES,
  type CardDefinition,
  type DeckWithEntries,
} from "@card-table/shared";
import { ApiConflictError, apiRequest } from "../../../api/client";
import { errorMessage } from "../errors";
import { DeckResponseSchema, totalCopies } from "./deck-api";

function clampCopies(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_DECK_ENTRY_COPIES, Math.max(0, Math.trunc(value))) : 0;
}

/** Creates a deck when `deckId` is null, otherwise edits it at its loaded revision. */
export function DeckEditor({
  setId,
  deckId,
  cards,
  onClose,
  onSaved,
}: {
  setId: string;
  deckId: string | null;
  cards: CardDefinition[];
  onClose(): void;
  onSaved(): void;
}) {
  const [deck, setDeck] = useState<DeckWithEntries | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // An existing deck must load first, or saving would create a duplicate.
  const isLoading = deckId !== null && deck === null;

  useEffect(() => {
    if (deckId === null) return;
    apiRequest(`/api/decks/${deckId}`, DeckResponseSchema)
      .then(({ deck: loaded }) => {
        setDeck(loaded);
        setName(loaded.name);
        setDescription(loaded.description);
        setCopies(Object.fromEntries(loaded.entries.map((entry) => [entry.cardId, entry.copies])));
      })
      .catch((cause: unknown) => setError(errorMessage(cause, "Could not load deck.")));
  }, [deckId]);

  const entries = useMemo(
    () => Object.entries(copies)
      .filter(([, count]) => count > 0)
      .map(([cardId, count]) => ({ cardId, copies: count })),
    [copies],
  );
  const total = totalCopies(entries);
  const typeTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const card of cards) {
      const count = copies[card.id] ?? 0;
      if (count > 0) totals.set(card.type, (totals.get(card.type) ?? 0) + count);
    }
    return [...totals].map(([type, count]) => `${type}: ${count}`).join(" · ");
  }, [cards, copies]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (isLoading) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { name, description, entries };
      if (deck) {
        await apiRequest(`/api/decks/${deck.id}`, DeckResponseSchema, {
          method: "PUT",
          body: JSON.stringify({ ...payload, revision: deck.revision }),
        });
      } else {
        await apiRequest(`/api/sets/${setId}/decks`, DeckResponseSchema, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiConflictError
          ? "This deck changed elsewhere. Your edits remain here; reload it before saving again."
          : errorMessage(cause, "Could not save deck."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor-backdrop" role="presentation">
      <form className="card-editor" aria-label={deckId ? "Edit deck" : "New deck"}
        onSubmit={(event) => void save(event)}>
        <header>
          <h2>{deckId ? "Edit deck" : "New deck"}</h2>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {error && <p className="workspace-error" role="alert">{error}</p>}
        {isLoading && !error ? (
          <p>Loading deck…</p>
        ) : (
          <div className="editor-form">
            <label>
              Name
              <input required maxLength={DECK_NAME_MAX_LENGTH} value={name}
                onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Description
              <input maxLength={DESCRIPTION_MAX_LENGTH} value={description}
                onChange={(event) => setDescription(event.target.value)} />
            </label>
            <p aria-live="polite">
              <strong>{total}</strong> cards{typeTotals && ` · ${typeTotals}`}
            </p>
            <div className="deck-card-list">
              {cards.map((card) => (
                <label key={card.id} className="deck-card">
                  <span>{card.name} <small>{card.type}</small></span>
                  <input aria-label={`${card.name} copies`} type="number" min="0"
                    max={MAX_DECK_ENTRY_COPIES} value={copies[card.id] ?? 0}
                    onChange={(event) => {
                      const count = clampCopies(event.target.valueAsNumber);
                      setCopies((current) => ({ ...current, [card.id]: count }));
                    }} />
                </label>
              ))}
            </div>
            <button type="submit" disabled={busy || isLoading || total === 0}>
              {busy ? "Saving…" : "Save deck"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
