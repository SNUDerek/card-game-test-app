import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardSet, CardSetSummary } from "@card-table/shared";
import SetListScreen from "./SetListScreen";
import { sentBody, stubFetch } from "../../test/fetch";

const navigate = vi.fn();
vi.mock("wouter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => ["/sets", navigate],
}));

const SET_ID = "11111111-1111-4111-8111-111111111111";
const set: CardSet = {
  id: SET_ID, name: "Skirmish", description: "Starter set", forkedFromSetId: null,
  revision: 3, archived: false, createdAt: 1, updatedAt: 1,
};
const summary: CardSetSummary = { ...set, forkedFromSetName: null, cardCount: 12, deckCount: 2 };

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("SetListScreen", () => {
  it("lists sets with their counts", async () => {
    stubFetch({ "GET /api/sets": () => ({ body: { sets: [summary] } }) });
    render(<SetListScreen />);

    expect(await screen.findByRole("link", { name: "Skirmish" })).toBeInTheDocument();
    expect(screen.getByText("12 cards · 2 decks")).toBeInTheDocument();
  });

  it("creates a set and opens it, accepting the bare set the server returns", async () => {
    const fetchMock = stubFetch({
      "GET /api/sets": () => ({ body: { sets: [] } }),
      "POST /api/sets": () => ({ status: 201, body: { set: { ...set, name: "Fresh" } } }),
    });
    render(<SetListScreen />);
    fireEvent.change(screen.getByLabelText("New set name"), { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: "Create set" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/sets/${SET_ID}`));
    expect(sentBody(fetchMock, "POST /api/sets")).toEqual({ name: "Fresh", description: "" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("confirms before archiving and suggests forking when the set is in use", async () => {
    const fetchMock = stubFetch({
      "GET /api/sets": () => ({ body: { sets: [summary] } }),
      [`DELETE /api/sets/${SET_ID}`]: () => ({ status: 409, body: { error: "Set is in use by an open room." } }),
    });
    render(<SetListScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    expect(fetchMock).not.toHaveBeenCalledWith(`/api/sets/${SET_ID}`, expect.anything());

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Set is in use by an open room. Fork the set to keep editing while its room stays open.",
    );
  });

  it("shows archived sets on request and unarchives at the loaded revision", async () => {
    const archived = { ...summary, archived: true };
    const fetchMock = stubFetch({
      "GET /api/sets": () => ({ body: { sets: [] } }),
      "GET /api/sets?archived=true": () => ({ body: { sets: [archived] } }),
      [`PATCH /api/sets/${SET_ID}`]: () => ({ body: { set } }),
    });
    render(<SetListScreen />);
    fireEvent.click(screen.getByLabelText("Show archived"));
    fireEvent.click(await screen.findByRole("button", { name: "Unarchive" }));

    await waitFor(() => expect(sentBody(fetchMock, `PATCH /api/sets/${SET_ID}`))
      .toEqual({ revision: 3, archived: false }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
