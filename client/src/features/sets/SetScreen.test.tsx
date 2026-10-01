import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardSet } from "@card-table/shared";
import { cardDefinition } from "../../test/card-definitions";
import SetScreen from "./SetScreen";
import { sentBody, stubFetch } from "../../test/fetch";

const navigate = vi.fn();
vi.mock("wouter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => ["/sets/x", navigate],
}));
vi.mock("./cards/CardEditor", () => ({
  CardEditor: ({ card }: { card: { name: string } | null }) => (
    <div role="dialog" aria-label="Card editor">{card ? card.name : "new"}</div>
  ),
}));

const SET_ID = "11111111-1111-4111-8111-111111111111";
const set: CardSet = {
  id: SET_ID, name: "Skirmish", description: "", forkedFromSetId: null,
  revision: 2, archived: false, createdAt: 1, updatedAt: 1,
};
const cards = [
  cardDefinition({ id: "c1", name: "Fireball", type: "spell", body: "Deal 3 damage." }),
  cardDefinition({ id: "c2", name: "Goblin", type: "creature", body: "A small menace." }),
];

function routes(extra: Parameters<typeof stubFetch>[0] = {}) {
  return stubFetch({
    [`GET /api/sets/${SET_ID}`]: () => ({ body: { set } }),
    [`GET /api/sets/${SET_ID}/cards`]: () => ({ body: { cards } }),
    ...extra,
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("SetScreen", () => {
  it("searches cards by text and filters by type", async () => {
    routes();
    render(<SetScreen params={{ id: SET_ID }} />);
    const grid = await screen.findByRole("region", { name: "Cards" });
    expect(within(grid).getAllByRole("button")).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "damage" } });
    expect(within(grid).getByText("Fireball")).toBeInTheDocument();
    expect(within(grid).queryByText("Goblin")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter cards by type"), { target: { value: "creature" } });
    expect(within(grid).getByText("Goblin")).toBeInTheDocument();
    expect(within(grid).queryByText("Fireball")).not.toBeInTheDocument();
  });

  it("opens the editor for an existing or a new card", async () => {
    routes();
    render(<SetScreen params={{ id: SET_ID }} />);
    fireEvent.click(await screen.findByRole("button", { name: /Goblin/ }));
    expect(screen.getByRole("dialog", { name: "Card editor" })).toHaveTextContent("Goblin");
  });

  it("keeps the draft and explains a stale save", async () => {
    routes({
      [`PATCH /api/sets/${SET_ID}`]: () => ({ status: 409, body: { error: "Set has changed." } }),
    });
    render(<SetScreen params={{ id: SET_ID }} />);
    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This set changed elsewhere.");
    expect(name).toHaveValue("Renamed");
  });

  it("forks under a chosen name and opens the fork", async () => {
    const forkId = "22222222-2222-4222-8222-222222222222";
    const fetchMock = routes({
      [`POST /api/sets/${SET_ID}/fork`]: () => ({ status: 201, body: { set: { id: forkId } } }),
    });
    render(<SetScreen params={{ id: SET_ID }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Fork" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Name for the fork")).toHaveValue("Skirmish copy");
    fireEvent.click(within(dialog).getByRole("button", { name: "Fork" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/sets/${forkId}`));
    expect(sentBody(fetchMock, `POST /api/sets/${SET_ID}/fork`)).toEqual({ name: "Skirmish copy" });
  });

  it("offers a fork when archiving is refused because a room uses the set", async () => {
    routes({
      [`DELETE /api/sets/${SET_ID}`]: () => ({ status: 409, body: { error: "Set is in use." } }),
    });
    render(<SetScreen params={{ id: SET_ID }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }));

    expect(await screen.findByText(/This set is in use by an open room/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "fork this set" })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
