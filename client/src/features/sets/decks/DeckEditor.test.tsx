import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardDefinition } from "../../../test/card-definitions";
import { sentBody, stubFetch } from "../../../test/fetch";
import { DeckEditor } from "./DeckEditor";

const SET_ID = "set-1";
const DECK_ID = "33333333-3333-4333-8333-333333333333";
const cards = [
  cardDefinition({ id: "c1", name: "Fireball", type: "spell" }),
  cardDefinition({ id: "c2", name: "Bolt", type: "spell" }),
  cardDefinition({ id: "c3", name: "Goblin", type: "creature" }),
];
const savedDeck = {
  id: DECK_ID, setId: SET_ID, name: "Burn", description: "", revision: 5,
  cardCount: 3, updatedAt: 1, entries: [{ cardId: "c1", copies: 3 }],
};
const onSaved = vi.fn();

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

function renderEditor(deckId: string | null) {
  render(<DeckEditor setId={SET_ID} deckId={deckId} cards={cards} onClose={() => undefined} onSaved={onSaved} />);
}

describe("DeckEditor", () => {
  it("totals copies overall and by type, and creates the deck", async () => {
    const fetchMock = stubFetch({
      [`POST /api/sets/${SET_ID}/decks`]: () => ({ status: 201, body: { deck: savedDeck } }),
    });
    renderEditor(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Mixed" } });
    fireEvent.change(screen.getByLabelText("Fireball copies"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Bolt copies"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Goblin copies"), { target: { value: "4" } });

    expect(screen.getByText(/cards · spell: 3 · creature: 4/)).toHaveTextContent("7 cards");

    fireEvent.click(screen.getByRole("button", { name: "Save deck" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sentBody(fetchMock, `POST /api/sets/${SET_ID}/decks`)).toEqual({
      name: "Mixed",
      description: "",
      entries: [{ cardId: "c1", copies: 2 }, { cardId: "c2", copies: 1 }, { cardId: "c3", copies: 4 }],
    });
  });

  it("cannot save an existing deck until it has loaded", async () => {
    let release: () => void = () => undefined;
    const loaded = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response(JSON.stringify({ deck: savedDeck }), { status: 200 });
      await loaded;
      return new Response(JSON.stringify({ deck: savedDeck }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderEditor(DECK_ID);

    expect(screen.getByText("Loading deck…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save deck" })).not.toBeInTheDocument();

    release();
    expect(await screen.findByLabelText("Name")).toHaveValue("Burn");
    expect(screen.getByLabelText("Fireball copies")).toHaveValue(3);
  });

  it("updates an existing deck at its loaded revision", async () => {
    const fetchMock = stubFetch({
      [`GET /api/decks/${DECK_ID}`]: () => ({ body: { deck: savedDeck } }),
      [`PUT /api/decks/${DECK_ID}`]: () => ({ body: { deck: savedDeck } }),
    });
    renderEditor(DECK_ID);
    fireEvent.change(await screen.findByLabelText("Fireball copies"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save deck" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sentBody(fetchMock, `PUT /api/decks/${DECK_ID}`)).toEqual({
      name: "Burn", description: "", entries: [{ cardId: "c1", copies: 4 }], revision: 5,
    });
    expect(fetchMock).not.toHaveBeenCalledWith(`/api/sets/${SET_ID}/decks`, expect.anything());
  });

  it("keeps edits and explains a stale save", async () => {
    stubFetch({
      [`GET /api/decks/${DECK_ID}`]: () => ({ body: { deck: savedDeck } }),
      [`PUT /api/decks/${DECK_ID}`]: () => ({ status: 409, body: { error: "Deck has changed." } }),
    });
    renderEditor(DECK_ID);
    fireEvent.change(await screen.findByLabelText("Bolt copies"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save deck" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This deck changed elsewhere.");
    expect(screen.getByLabelText("Bolt copies")).toHaveValue(2);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
