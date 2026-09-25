import { useMemo, useState } from "react";
import { useCardCatalog } from "./CardCatalogContext";
import "./CardBrowser.css";

export const CARD_DEFINITION_MIME_TYPE = "application/x-card-definition-id";

export function CardBrowser() {
  const { cards, isLoading, error } = useCardCatalog();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "id" | "type">("name");

  const filteredCards = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return cards
      .filter(
        (card) =>
          card.name.toLocaleLowerCase().includes(query) ||
          card.id.toLocaleLowerCase().includes(query) ||
          card.type.toLocaleLowerCase().includes(query),
      )
      .sort((a, b) => a[sortBy].localeCompare(b[sortBy]));
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
                onChange={(e) => setSortBy(e.target.value as "name" | "id" | "type")}
                className="card-browser-sort"
              >
                <option value="name">Sort by Name</option>
                <option value="id">Sort by ID</option>
                <option value="type">Sort by Type</option>
              </select>
            </div>
          </div>

          <div className="card-browser-grid">
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
                      selectable for copying ids into notes. */}
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
                    <div className="card-id">{card.id}</div>
                  </div>
                </article>
              ))}
          </div>
        </aside>
      )}
    </>
  );
}
