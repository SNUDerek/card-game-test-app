import { useMemo, useState } from "react";
import type { CardDefinition } from "@card-table/shared";

/** A set's cards, searchable by name or rules text and filterable by type. */
export function CardList({
  cards,
  onEdit,
  onNew,
}: {
  cards: CardDefinition[];
  onEdit(card: CardDefinition): void;
  onNew(): void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const types = useMemo(() => [...new Set(cards.map((card) => card.type))].sort(), [cards]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return cards.filter((card) =>
      (!type || card.type === type) &&
      `${card.name} ${card.body}`.toLocaleLowerCase().includes(needle));
  }, [cards, query, type]);

  return (
    <>
      <div className="card-controls">
        <input aria-label="Search cards" placeholder="Search cards" value={query}
          onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Filter cards by type" value={type}
          onChange={(event) => setType(event.target.value)}>
          <option value="">All types</option>
          {types.map((entry) => <option key={entry}>{entry}</option>)}
        </select>
        <button type="button" onClick={onNew}>New card</button>
      </div>
      <section className="card-grid" aria-label="Cards">
        {filtered.map((card) => (
          <button className="card-tile" type="button" key={card.id} title={card.body}
            onClick={() => onEdit(card)}>
            <img src={card.imageUrl} alt="" />
            <strong>{card.name}</strong>
            <small>{card.type}</small>
            {card.body && <p className="card-tile-body">{card.body}</p>}
          </button>
        ))}
        {filtered.length === 0 && <p className="workspace-muted">No matching cards.</p>}
      </section>
    </>
  );
}
