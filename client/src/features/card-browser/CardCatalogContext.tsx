import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CardCatalogResponseSchema, type CardDefinition } from "@card-table/shared";

interface CardCatalogValue {
  cards: CardDefinition[];
  definitionsById: ReadonlyMap<string, CardDefinition>;
  isLoading: boolean;
  error: string | null;
}

const CardCatalogContext = createContext<CardCatalogValue | null>(null);

export function CardCatalogProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<CardDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCards() {
      try {
        const response = await fetch("/api/cards", { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Catalog request failed with status ${response.status}.`);
        }
        setCards(CardCatalogResponseSchema.parse(await response.json()).cards);
      } catch (cause) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch cards:", cause);
        setError("The card catalog could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadCards();
    return () => controller.abort();
  }, []);

  const definitionsById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );

  return (
    <CardCatalogContext.Provider value={{ cards, definitionsById, isLoading, error }}>
      {children}
    </CardCatalogContext.Provider>
  );
}

export function useCardCatalog(): CardCatalogValue {
  const catalog = useContext(CardCatalogContext);
  if (!catalog) throw new Error("useCardCatalog must be used inside CardCatalogProvider.");
  return catalog;
}
