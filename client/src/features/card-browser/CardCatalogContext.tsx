import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  SetCardsResponseSchema,
  type CardDefinition,
  type CatalogChangedEvent,
} from "@card-table/shared";

/** A short-lived line telling the table who just changed its cards. */
export interface CatalogNotice {
  /** Distinguishes repeats of the same text, so each one restarts its timer. */
  id: number;
  text: string;
}

interface CardCatalogValue {
  cards: CardDefinition[];
  definitionsById: ReadonlyMap<string, CardDefinition>;
  isLoading: boolean;
  error: string | null;
  notice: CatalogNotice | null;
  dismissNotice(): void;
}

export type CatalogChangeSubscriber = (
  listener: (event: CatalogChangedEvent) => void,
) => () => void;

interface CardCatalogProviderProps {
  /** The room's set. Empty until the room state arrives. */
  setId: string;
  /** Library edits to this set, relayed by the room. */
  subscribeToChanges: CatalogChangeSubscriber;
  children: ReactNode;
}

/** "Alice edited Fireball", "Alice edited 3 cards", "Someone edited the set". */
export function describeCatalogChange(
  event: CatalogChangedEvent,
  definitionsById: ReadonlyMap<string, CardDefinition>,
): string {
  const editor = event.editorName ?? "Someone";
  const ids = event.changedCardIds;
  if (ids.length === 0) return `${editor} edited the set`;
  if (ids.length === 1) {
    const name = definitionsById.get(ids[0]!)?.name;
    return name ? `${editor} edited ${name}` : `${editor} edited a card`;
  }
  return `${editor} edited ${ids.length} cards`;
}

const CardCatalogContext = createContext<CardCatalogValue | null>(null);

/**
 * The card definitions of the room's set. Table instances only store a card
 * id, so every card on the table renders from this list, and refetching it is
 * how a mid-game library edit reaches the table.
 */
export function CardCatalogProvider({ setId, subscribeToChanges, children }: CardCatalogProviderProps) {
  const [cards, setCards] = useState<CardDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<CatalogNotice | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const noticeCount = useRef(0);

  /** Loads the set's cards, replacing any load still in flight. Resolves to the new list. */
  const load = useCallback(async (): Promise<CardDefinition[] | undefined> => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const response = await fetch(`/api/sets/${encodeURIComponent(setId)}/cards`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Card request failed with status ${response.status}.`);
      }
      const loaded = SetCardsResponseSchema.parse(await response.json()).cards;
      if (controller.signal.aborted) return undefined;
      setCards(loaded);
      setError(null);
      return loaded;
    } catch (cause) {
      if (controller.signal.aborted) return undefined;
      console.error("Failed to fetch cards:", cause);
      setError("The card catalog could not be loaded.");
      return undefined;
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    if (!setId) return;
    setIsLoading(true);
    void load();
    return () => inFlight.current?.abort();
  }, [setId, load]);

  useEffect(() => {
    if (!setId) return;
    return subscribeToChanges((event) => {
      if (event.setId !== setId) return;
      void load().then((loaded) => {
        if (!loaded) return;
        const byId = new Map(loaded.map((card) => [card.id, card]));
        noticeCount.current += 1;
        setNotice({ id: noticeCount.current, text: describeCatalogChange(event, byId) });
      });
    });
  }, [setId, subscribeToChanges, load]);

  const definitionsById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  return (
    <CardCatalogContext.Provider
      value={{ cards, definitionsById, isLoading, error, notice, dismissNotice }}
    >
      {children}
    </CardCatalogContext.Provider>
  );
}

export function useCardCatalog(): CardCatalogValue {
  const catalog = useContext(CardCatalogContext);
  if (!catalog) throw new Error("useCardCatalog must be used inside CardCatalogProvider.");
  return catalog;
}
