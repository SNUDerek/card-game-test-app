import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cardDefinition } from "../../../test/card-definitions";
import { sentBody, stubFetch } from "../../../test/fetch";
import { DeckList } from "./DeckList";

const SET_ID = "set-1";
const cards = [
  cardDefinition({ id: "c1", name: "Fireball", type: "spell" }),
  cardDefinition({ id: "c2", name: "Goblin", type: "creature" }),
];
const deck = (name: string, cardCount: number) => ({
  id: `deck-${name}`, setId: SET_ID, name, description: "", revision: 1, cardCount, updatedAt: 1,
});

afterEach(() => vi.unstubAllGlobals());

describe("DeckList", () => {
  it("refreshes the list after a deck is saved", async () => {
    let decks = [deck("Burn", 20)];
    stubFetch({
      [`GET /api/sets/${SET_ID}/decks`]: () => ({ body: { decks } }),
      [`POST /api/sets/${SET_ID}/decks`]: () => {
        decks = [...decks, deck("Fresh", 2)];
        return { status: 201, body: { deck: { ...deck("Fresh", 2), entries: [{ cardId: "c1", copies: 2 }] } } };
      },
    });
    render(<DeckList setId={SET_ID} cards={cards} />);
    expect(await screen.findByText("Burn")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New deck" }));
    const editor = screen.getByRole("form", { name: "New deck" });
    fireEvent.change(within(editor).getByLabelText("Name"), { target: { value: "Fresh" } });
    fireEvent.change(within(editor).getByLabelText("Fireball copies"), { target: { value: "2" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save deck" }));

    expect(await screen.findByText("Fresh")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "New deck" })).not.toBeInTheDocument();
  });

  it("generates a deck from selected types and saves it with its seed", async () => {
    const fetchMock = stubFetch({
      [`GET /api/sets/${SET_ID}/decks`]: () => ({ body: { decks: [] } }),
      [`POST /api/sets/${SET_ID}/decks/generate`]: () => ({
        body: { entries: [{ cardId: "c2", copies: 3 }], seed: "abc" },
      }),
      [`POST /api/sets/${SET_ID}/decks`]: () => ({
        status: 201, body: { deck: { ...deck("Rolled", 3), entries: [{ cardId: "c2", copies: 3 }] } },
      }),
    });
    render(<DeckList setId={SET_ID} cards={cards} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate deck" }));
    const dialog = screen.getByRole("form", { name: "Generate deck" });
    fireEvent.change(within(dialog).getByLabelText("Deck size"), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByLabelText("creature"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Generate" }));

    expect(await within(dialog).findByText("abc")).toBeInTheDocument();
    expect(sentBody(fetchMock, `POST /api/sets/${SET_ID}/decks/generate`)).toEqual({
      params: { size: 3, maxCopies: 4, includeTypes: ["creature"] },
    });

    fireEvent.change(within(dialog).getByLabelText("Deck name"), { target: { value: "Rolled" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save generated deck" }));
    await waitFor(() => expect(sentBody(fetchMock, `POST /api/sets/${SET_ID}/decks`)).toEqual({
      name: "Rolled", description: "Generated with seed abc", entries: [{ cardId: "c2", copies: 3 }],
    }));
  });
});
