import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardDefinition } from "../../../test/card-definitions";
import { sentBody, stubFetch } from "../../../test/fetch";
import { CardEditor } from "./CardEditor";

// Konva needs a real canvas; the preview's content is CardRenderer's concern.
vi.mock("react-konva", () => ({
  Stage: ({ children }: { children: unknown }) => <div data-testid="preview">{children as never}</div>,
  Layer: ({ children }: { children: unknown }) => <>{children as never}</>,
}));
vi.mock("../../../cards/CardRenderer", () => ({
  CARD_WIDTH: 200,
  CARD_HEIGHT: 280,
  CardRenderer: ({ definition }: { definition: { name: string; imageUrl: string } }) => (
    <span data-testid="preview-card" data-image={definition.imageUrl}>{definition.name}</span>
  ),
}));

const SET_ID = "set-1";
const IMAGE_ID = "a".repeat(64);
const image = { id: IMAGE_ID, mime: "image/png", width: 256, height: 256, byteSize: 10, createdAt: 1 };
const onSaved = vi.fn();

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

function renderEditor(card: Parameters<typeof CardEditor>[0]["card"]) {
  render(<CardEditor setId={SET_ID} card={card} onClose={() => undefined} onSaved={onSaved} />);
}

describe("CardEditor", () => {
  it("previews the draft live and creates the card with chosen artwork", async () => {
    const fetchMock = stubFetch({
      "GET /api/images": () => ({ body: { images: [image] } }),
      [`POST /api/sets/${SET_ID}/cards`]: () => ({ status: 201, body: { card: { id: "new" } } }),
    });
    renderEditor(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fireball" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "spell" } });
    await screen.findByRole("option", { name: /256×256/ });
    fireEvent.change(screen.getByLabelText("Existing artwork"), { target: { value: IMAGE_ID } });

    expect(screen.getByTestId("preview-card")).toHaveTextContent("Fireball");
    expect(screen.getByTestId("preview-card")).toHaveAttribute("data-image", `/images/${IMAGE_ID}`);

    fireEvent.click(screen.getByRole("button", { name: "Save card" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sentBody(fetchMock, `POST /api/sets/${SET_ID}/cards`)).toEqual({
      name: "Fireball", type: "spell", body: "", imageId: IMAGE_ID,
    });
  });

  it("requires artwork before saving", () => {
    stubFetch({ "GET /api/images": () => ({ body: { images: [] } }) });
    renderEditor(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fireball" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "spell" } });
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choose or upload artwork first.");
  });

  it("saves edits at the loaded revision and keeps the draft on conflict", async () => {
    const card = cardDefinition({ id: "c1", name: "Fireball", imageId: IMAGE_ID, revision: 4 });
    const fetchMock = stubFetch({
      "GET /api/images": () => ({ body: { images: [image] } }),
      "PUT /api/cards/c1": () => ({ status: 409, body: { error: "Card has changed." } }),
    });
    renderEditor(card);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Inferno" } });
    fireEvent.click(screen.getByRole("button", { name: "Save card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This card changed elsewhere.");
    expect(sentBody(fetchMock, "PUT /api/cards/c1")).toMatchObject({ name: "Inferno", revision: 4 });
    expect(screen.getByLabelText("Name")).toHaveValue("Inferno");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
