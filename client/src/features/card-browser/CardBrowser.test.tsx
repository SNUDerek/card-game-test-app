import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardBrowser } from "./CardBrowser";

const cards = [
  {
    id: "a-spell",
    name: "Zephyr",
    type: "spell",
    body: "Move quickly.",
    imageUrl: "/cards/zephyr.png",
    sourceName: "zephyr",
  },
  {
    id: "z-creature",
    name: "Albatross",
    type: "creature",
    body: "Fly above the table.",
    imageUrl: "/cards/albatross.png",
    sourceName: "albatross",
  },
];

afterEach(() => vi.restoreAllMocks());

function mockCatalogResponse(body: unknown, ok = true) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response);
}

async function openBrowser() {
  render(<CardBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Open Catalog" }));
  await waitFor(() => expect(screen.queryByText("Loading catalog…")).not.toBeInTheDocument());
}

describe("CardBrowser", () => {
  it("filters and sorts catalog cards", async () => {
    mockCatalogResponse({ cards });
    await openBrowser();

    const grid = screen.getByText("Albatross").closest<HTMLElement>(".card-browser-grid");
    expect(grid).not.toBeNull();
    expect(within(grid!).getAllByRole("article").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Albatross"),
      expect.stringContaining("Zephyr"),
    ]);

    fireEvent.change(screen.getByLabelText("Sort cards"), { target: { value: "id" } });
    expect(within(grid!).getAllByRole("article").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Zephyr"),
      expect.stringContaining("Albatross"),
    ]);

    fireEvent.change(screen.getByLabelText("Filter cards"), {
      target: { value: "a-spell" },
    });
    expect(screen.getByText("Zephyr")).toBeInTheDocument();
    expect(screen.queryByText("Albatross")).not.toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    mockCatalogResponse({ cards: [] });
    await openBrowser();

    expect(screen.getByText("No cards match this filter.")).toBeInTheDocument();
  });

  it("shows a stable error when loading fails", async () => {
    mockCatalogResponse({}, false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await openBrowser();

    expect(screen.getByText("The card catalog could not be loaded.")).toBeInTheDocument();
  });
});
