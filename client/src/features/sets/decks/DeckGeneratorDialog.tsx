import { useMemo, useState, type FormEvent } from "react";
import {
  DECK_NAME_MAX_LENGTH,
  MAX_DECK_ENTRY_COPIES,
  MAX_DECK_SIZE,
  type CardDefinition,
  type GeneratedDeck,
} from "@card-table/shared";
import { apiRequest } from "../../../api/client";
import { errorMessage } from "../errors";
import { DeckResponseSchema, generateDeck, totalCopies } from "./deck-api";

/** Rolls a random deck from the set's cards, then optionally saves it. */
export function DeckGeneratorDialog({
  setId,
  cards,
  onClose,
  onSaved,
}: {
  setId: string;
  cards: CardDefinition[];
  onClose(): void;
  onSaved(): void;
}) {
  const types = useMemo(() => [...new Set(cards.map((card) => card.type))].sort(), [cards]);
  const [size, setSize] = useState(40);
  const [maxCopies, setMaxCopies] = useState(4);
  const [seed, setSeed] = useState("");
  const [includeTypes, setIncludeTypes] = useState<string[]>([]);
  const [result, setResult] = useState<GeneratedDeck | null>(null);
  const [name, setName] = useState("Generated deck");
  const [error, setError] = useState<string | null>(null);
  const paramsValid = Number.isInteger(size) && size >= 1 && Number.isInteger(maxCopies) && maxCopies >= 1;

  function toggleType(type: string) {
    setIncludeTypes((current) =>
      current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]);
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    try {
      setResult(await generateDeck(setId, { size, maxCopies, seed, includeTypes }));
      setError(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Could not generate deck."));
    }
  }

  async function save() {
    if (!result) return;
    try {
      await apiRequest(`/api/sets/${setId}/decks`, DeckResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          name,
          description: `Generated with seed ${result.seed}`,
          entries: result.entries,
        }),
      });
      onSaved();
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Could not save deck."));
    }
  }

  return (
    <div className="editor-backdrop" role="presentation">
      <form className="card-editor" aria-label="Generate deck" onSubmit={(event) => void generate(event)}>
        <header>
          <h2>Generate deck</h2>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {error && <p className="workspace-error" role="alert">{error}</p>}
        <div className="editor-form">
          <label>
            Deck size
            <input type="number" min="1" max={MAX_DECK_SIZE} value={Number.isNaN(size) ? "" : size}
              onChange={(event) => setSize(event.target.valueAsNumber)} />
          </label>
          <label>
            Max copies
            <input type="number" min="1" max={MAX_DECK_ENTRY_COPIES}
              value={Number.isNaN(maxCopies) ? "" : maxCopies}
              onChange={(event) => setMaxCopies(event.target.valueAsNumber)} />
          </label>
          <label>
            Seed (optional)
            <input value={seed} maxLength={64} onChange={(event) => setSeed(event.target.value)} />
          </label>
          <fieldset className="deck-types">
            <legend>Types (none selected means all)</legend>
            {types.map((type) => (
              <label key={type}>
                <input type="checkbox" checked={includeTypes.includes(type)}
                  onChange={() => toggleType(type)} />
                {type}
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={!paramsValid}>{result ? "Reroll" : "Generate"}</button>

          {result && (
            <>
              <p>
                Seed: <code>{result.seed}</code> · {totalCopies(result.entries)} cards
              </p>
              <label>
                Deck name
                <input value={name} maxLength={DECK_NAME_MAX_LENGTH}
                  onChange={(event) => setName(event.target.value)} />
              </label>
              <button type="button" disabled={!name.trim()} onClick={() => void save()}>
                Save generated deck
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
