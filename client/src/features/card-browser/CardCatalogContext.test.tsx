import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogChangedEvent } from "@card-table/shared";
import { cardDefinition } from "../../test/card-definitions";
import {
  CardCatalogProvider,
  describeCatalogChange,
  useCardCatalog,
} from "./CardCatalogContext";
import { CatalogNoticeToast } from "./CatalogNoticeToast";

afterEach(() => vi.restoreAllMocks());

function respondWith(...bodies: unknown[]) {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body } as Response);
  }
  return fetchMock;
}

/** A hand-driven stand-in for the room's CATALOG_CHANGED relay. */
function changeFeed() {
  const listeners = new Set<(event: CatalogChangedEvent) => void>();
  return {
    subscribe: (listener: (event: CatalogChangedEvent) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    emit: (event: CatalogChangedEvent) => listeners.forEach((listener) => listener(event)),
  };
}

function CardNames() {
  const { cards } = useCardCatalog();
  return <p data-testid="names">{cards.map((card) => card.name).join(",")}</p>;
}

describe("CardCatalogProvider", () => {
  it("loads the cards of the room's set", async () => {
    const fetchMock = respondWith({ cards: [cardDefinition({ id: "c1", name: "Fireball" })] });

    render(
      <CardCatalogProvider setId="set-1" subscribeToChanges={changeFeed().subscribe}>
        <CardNames />
      </CardCatalogProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("names")).toHaveTextContent("Fireball"));
    expect(fetchMock).toHaveBeenCalledWith("/api/sets/set-1/cards", expect.anything());
  });

  it("waits for a set id before loading", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    render(
      <CardCatalogProvider setId="" subscribeToChanges={changeFeed().subscribe}>
        <CardNames />
      </CardCatalogProvider>,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refetches on a change to its set and says who made it", async () => {
    const feed = changeFeed();
    respondWith(
      { cards: [cardDefinition({ id: "c1", name: "Fireball" })] },
      { cards: [cardDefinition({ id: "c1", name: "Inferno" })] },
    );

    render(
      <CardCatalogProvider setId="set-1" subscribeToChanges={feed.subscribe}>
        <CardNames />
        <CatalogNoticeToast />
      </CardCatalogProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("names")).toHaveTextContent("Fireball"));

    act(() => feed.emit({ setId: "set-1", changedCardIds: ["c1"], editorName: "Alice" }));

    await waitFor(() => expect(screen.getByTestId("names")).toHaveTextContent("Inferno"));
    expect(screen.getByRole("status")).toHaveTextContent("Alice edited Inferno");
  });

  it("ignores changes to other sets", async () => {
    const feed = changeFeed();
    const fetchMock = respondWith({ cards: [] });

    render(
      <CardCatalogProvider setId="set-1" subscribeToChanges={feed.subscribe}>
        <CardNames />
      </CardCatalogProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => feed.emit({ setId: "set-2", changedCardIds: [], editorName: "Bob" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("CatalogNoticeToast", () => {
  it("disappears on its own", async () => {
    const feed = changeFeed();
    respondWith({ cards: [] }, { cards: [] });
    render(
      <CardCatalogProvider setId="set-1" subscribeToChanges={feed.subscribe}>
        <CatalogNoticeToast durationMs={20} />
      </CardCatalogProvider>,
    );

    act(() => feed.emit({ setId: "set-1", changedCardIds: [], editorName: "Alice" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Alice edited the set"));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});

describe("describeCatalogChange", () => {
  const byId = new Map([["c1", cardDefinition({ id: "c1", name: "Fireball" })]]);

  it.each([
    [{ changedCardIds: ["c1"], editorName: "Alice" }, "Alice edited Fireball"],
    [{ changedCardIds: ["c1", "c2"], editorName: "Alice" }, "Alice edited 2 cards"],
    [{ changedCardIds: [], editorName: "Alice" }, "Alice edited the set"],
    [{ changedCardIds: ["missing"], editorName: null }, "Someone edited a card"],
  ])("describes %o as %s", (change, text) => {
    expect(describeCatalogChange({ setId: "set-1", ...change }, byId)).toBe(text);
  });
});
