import { useEffect, useMemo, useState } from "react";
import type { CardDefinition } from "@card-table/shared";
import { z } from "zod";
import { apiRequest } from "../../api/client";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import { useCardCatalog } from "./CardCatalogContext";
import "./CardBrowser.css";

export const CARD_DEFINITION_MIME_TYPE = "application/x-card-definition-id";

type SortKey = "position" | "name" | "type";

const compareBy: Record<SortKey, (a: CardDefinition, b: CardDefinition) => number> = {
  position: (a, b) => a.position - b.position,
  name: (a, b) => a.name.localeCompare(b.name),
  type: (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
};

export function CardBrowser() {
  const { cards, isLoading, error } = useCardCatalog();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("position");
  const [decksOpen, setDecksOpen] = useState(false);

  const filteredCards = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return cards
      .filter(
        (card) =>
          card.name.toLocaleLowerCase().includes(query) ||
          card.type.toLocaleLowerCase().includes(query),
      )
      .sort(compareBy[sortBy]);
  }, [cards, filter, sortBy]);

  return (
    <>
      <button
        className="card-browser-toggle"
        type="button"
        aria-controls="card-browser-panel"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? "Close Catalog" : "Open Catalog"}
      </button>

      {isOpen && (
        <aside
          id="card-browser-panel"
          className="card-browser-panel"
          aria-label="Card catalog"
        >
          <div className="card-browser-header">
            <h2>Card Catalog</h2>
            <button className="card-browser-decks" type="button" onClick={() => setDecksOpen((open) => !open)}>{decksOpen ? "Cards" : "Decks"}</button>
            {decksOpen ? <DeckPanel cards={cards} /> : <>
            <div className="card-browser-controls">
              <label className="visually-hidden" htmlFor="card-browser-filter">
                Filter cards
              </label>
              <input
                id="card-browser-filter"
                type="text"
                placeholder="Filter cards..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="card-browser-filter"
              />
              <label className="visually-hidden" htmlFor="card-browser-sort">
                Sort cards
              </label>
              <select
                id="card-browser-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="card-browser-sort"
              >
                <option value="position">Set order</option>
                <option value="name">Sort by Name</option>
                <option value="type">Sort by Type</option>
              </select>
            </div>
            </>}
          </div>

          {!decksOpen && <div className="card-browser-grid">
            {isLoading && <p className="card-browser-status">Loading catalog…</p>}
            {error && <p className="card-browser-status card-browser-error">{error}</p>}
            {!isLoading && !error && filteredCards.length === 0 && (
              <p className="card-browser-status">No cards match this filter.</p>
            )}
            {!isLoading &&
              !error &&
              filteredCards.map((card) => (
                <article key={card.id} className="card-browser-item">
                  {/* Only the artwork is draggable, so the row's text stays
                      selectable for copying into notes. */}
                  <img
                    src={card.imageUrl}
                    alt={`Drag ${card.name} onto the table`}
                    className="card-image"
                    loading="lazy"
                    decoding="async"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData(CARD_DEFINITION_MIME_TYPE, card.id);
                    }}
                  />
                  <div className="card-info">
                    <div className="card-name">{card.name}</div>
                    <div className="card-type">{card.type}</div>
                  </div>
                </article>
              ))}
          </div>}
        </aside>
      )}
    </>
  );
}

const DecksResponseSchema = z.object({ decks: z.array(z.object({ id: z.string(), name: z.string(), cardCount: z.number() })) });
function tableCentre() { return { x: window.innerWidth / 2, y: window.innerHeight / 2 }; }
function DeckPanel({ cards }: { cards: CardDefinition[] }) {
  const { setId, spawnDeck } = useMultiplayer();
  const [decks, setDecks] = useState<{ id: string; name: string; cardCount: number }[]>([]); const [error, setError] = useState<string | null>(null); const [size, setSize] = useState(40); const [maxCopies, setMaxCopies] = useState(4); const [seed, setSeed] = useState("");
  useEffect(() => { void apiRequest(`/api/sets/${setId}/decks`, DecksResponseSchema).then((body) => setDecks(body.decks)).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load decks.")); }, [setId]);
  async function dealSaved(deckId: string) { try { await spawnDeck({ source: "deck", deckId, ...tableCentre(), shuffle: true, face: "back" }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not deal deck."); } }
  async function generateAndDeal() { try { const body = await apiRequest(`/api/sets/${setId}/decks/generate`, z.object({ entries: z.array(z.object({ cardId: z.string(), copies: z.number() })) }), { method: "POST", body: JSON.stringify({ params: { size, maxCopies, ...(seed ? { seed } : {}) } }) }); await spawnDeck({ source: "entries", entries: body.entries, ...tableCentre(), shuffle: true, face: "back" }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate deck."); } }
  return <div className="deck-panel">{error && <p className="card-browser-error">{error}</p>}<h3>Saved decks</h3>{decks.map((deck) => <button key={deck.id} onClick={() => void dealSaved(deck.id)}>Deal {deck.name} ({deck.cardCount})</button>)}{decks.length === 0 && <p>No saved decks.</p>}<h3>Generate &amp; deal</h3><label>Size <input type="number" min="1" max="500" value={size} onChange={(e) => setSize(Number(e.target.value))} /></label><label>Max copies <input type="number" min="1" max="99" value={maxCopies} onChange={(e) => setMaxCopies(Number(e.target.value))} /></label><label>Seed <input value={seed} onChange={(e) => setSeed(e.target.value)} /></label><button onClick={() => void generateAndDeal()} disabled={!cards.length}>Generate &amp; deal</button></div>;
}
