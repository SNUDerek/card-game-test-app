import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sentBody, stubFetch } from "../../test/fetch";
import { DeckDealPanel } from "./DeckDealPanel";

const SET_ID = "set-1";
const DECK_ID = "33333333-3333-4333-8333-333333333333";
const spawnDeck = vi.fn().mockResolvedValue({ kind: "stack", stackId: "s1", cardCount: 20 });
vi.mock("../../multiplayer/MultiplayerContext", () => ({
  useMultiplayer: () => ({ setId: SET_ID, spawnDeck }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("innerWidth", 1000);
  vi.stubGlobal("innerHeight", 600);
});
afterEach(() => vi.unstubAllGlobals());

const savedDecks = {
  decks: [{ id: DECK_ID, setId: SET_ID, name: "Burn", description: "", revision: 1, cardCount: 20, updatedAt: 1 }],
};

describe("DeckDealPanel", () => {
  it("deals a saved deck shuffled and face down at the table centre", async () => {
    stubFetch({ [`GET /api/sets/${SET_ID}/decks`]: () => ({ body: savedDecks }) });
    render(<DeckDealPanel hasCards />);
    fireEvent.click(await screen.findByRole("button", { name: "Deal Burn (20)" }));

    await waitFor(() => expect(spawnDeck).toHaveBeenCalledWith({
      source: "deck", deckId: DECK_ID, x: 500, y: 300, shuffle: true, face: "back",
    }));
  });

  it("generates a deck and deals its entries without saving it", async () => {
    const fetchMock = stubFetch({
      [`GET /api/sets/${SET_ID}/decks`]: () => ({ body: { decks: [] } }),
      [`POST /api/sets/${SET_ID}/decks/generate`]: () => ({
        body: { entries: [{ cardId: "c1", copies: 2 }], seed: "s" },
      }),
    });
    render(<DeckDealPanel hasCards />);
    fireEvent.change(screen.getByLabelText("Seed"), { target: { value: " lucky " } });
    fireEvent.click(screen.getByRole("button", { name: "Generate & deal" }));

    await waitFor(() => expect(spawnDeck).toHaveBeenCalledWith({
      source: "entries", entries: [{ cardId: "c1", copies: 2 }], x: 500, y: 300, shuffle: true, face: "back",
    }));
    expect(sentBody(fetchMock, `POST /api/sets/${SET_ID}/decks/generate`)).toEqual({
      params: { size: 40, maxCopies: 4, seed: "lucky" },
    });
  });

  it("reports a deal the server refuses", async () => {
    stubFetch({ [`GET /api/sets/${SET_ID}/decks`]: () => ({ body: savedDecks }) });
    spawnDeck.mockRejectedValueOnce(new Error("Too many cards on the table."));
    render(<DeckDealPanel hasCards />);
    fireEvent.click(await screen.findByRole("button", { name: "Deal Burn (20)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many cards on the table.");
  });
});
