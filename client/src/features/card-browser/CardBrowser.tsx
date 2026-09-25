import { useEffect, useState } from "react";
import type { CardDefinition, CardCatalogResponse } from "@card-table/shared";
import "./CardBrowser.css";

export function CardBrowser() {
  const [cards, setCards] = useState<CardDefinition[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "id" | "type">("name");

  useEffect(() => {
    fetch("/api/cards")
      .then((res) => res.json())
      .then((data: CardCatalogResponse) => {
        setCards(data.cards);
      })
      .catch((err) => console.error("Failed to fetch cards:", err));
  }, []);

  const filteredCards = cards
    .filter(
      (card) =>
        card.name.toLowerCase().includes(filter.toLowerCase()) ||
        card.id.toLowerCase().includes(filter.toLowerCase()) ||
        card.type.toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => a[sortBy].localeCompare(b[sortBy]));

  return (
    <>
      <button 
        className="card-browser-toggle" 
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? "Close Catalog" : "Open Catalog"}
      </button>

      {isOpen && (
        <div className="card-browser-panel">
          <div className="card-browser-header">
            <h2>Card Catalog</h2>
            <div className="card-browser-controls">
              <input
                type="text"
                placeholder="Filter cards..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="card-browser-filter"
              />
              <select
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
            {filteredCards.map((card) => (
              <div key={card.id} className="card-browser-item">
                <img src={card.imageUrl} alt={card.name} className="card-image" />
                <div className="card-info">
                  <div className="card-name">{card.name}</div>
                  <div className="card-type">{card.type}</div>
                  <div className="card-body">{card.body}</div>
                  <div className="card-id">ID: {card.id}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
