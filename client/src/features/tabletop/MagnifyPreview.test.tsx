import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CardDefinition } from "@card-table/shared";
import { CARD_HEIGHT, CARD_WIDTH } from "../../cards/CardRenderer";
import { MAGNIFY_SCALE } from "../../state/local-ui-state";
import { MAX_BODY_FONT_SIZE } from "../../cards/fit-text";
import { getPreviewBounds, isWithinPreview, MagnifyPreview } from "./MagnifyPreview";

// Konva needs a real canvas for text measurement, which jsdom does not provide.
vi.mock("konva", () => ({
  default: {
    Text: class {
      private size = MAX_BODY_FONT_SIZE;
      fontSize(size: number) {
        this.size = size;
      }
      height() {
        return this.size;
      }
    },
  },
}));

const definition: CardDefinition = {
  id: "spell-001",
  name: "Fireball",
  type: "spell",
  body: "Deal 3 damage.",
  imageUrl: "/cards/fireball.png",
  sourceName: "fireball",
};

const container = { width: 2000, height: 2000 };

describe("getPreviewBounds", () => {
  it("centres the preview over the card it describes", () => {
    const bounds = getPreviewBounds({ x: 1000, y: 1000 }, container);

    expect(bounds.width).toBe(CARD_WIDTH * MAGNIFY_SCALE);
    expect(bounds.height).toBe(CARD_HEIGHT * MAGNIFY_SCALE);
    expect(bounds.left).toBe(1000 - bounds.width / 2);
    expect(bounds.top).toBe(1000 - bounds.height / 2);
  });

  it("keeps the preview on screen for a card near an edge", () => {
    const topLeft = getPreviewBounds({ x: 0, y: 0 }, container);
    expect(topLeft.left).toBe(8);
    expect(topLeft.top).toBe(8);

    const bottomRight = getPreviewBounds({ x: 2000, y: 2000 }, container);
    expect(bottomRight.left + bottomRight.width).toBe(2000 - 8);
    expect(bottomRight.top + bottomRight.height).toBe(2000 - 8);
  });

  it("pins a preview larger than the tabletop to the top left", () => {
    const bounds = getPreviewBounds({ x: 50, y: 50 }, { width: 100, height: 100 });

    expect(bounds.left).toBe(8);
    expect(bounds.top).toBe(8);
  });
});

describe("isWithinPreview", () => {
  const bounds = { left: 100, top: 200, width: 400, height: 560 };

  it("accepts points inside and on the edge, and rejects points outside", () => {
    expect(isWithinPreview({ x: 300, y: 400 }, bounds)).toBe(true);
    expect(isWithinPreview({ x: 100, y: 200 }, bounds)).toBe(true);
    expect(isWithinPreview({ x: 500, y: 760 }, bounds)).toBe(true);
    expect(isWithinPreview({ x: 99, y: 400 }, bounds)).toBe(false);
    expect(isWithinPreview({ x: 300, y: 761 }, bounds)).toBe(false);
  });
});

describe("MagnifyPreview", () => {
  const bounds = getPreviewBounds({ x: 1000, y: 1000 }, container);

  it("renders a face-up card magnified without any network traffic", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<MagnifyPreview definition={definition} face="front" bounds={bounds} />);

    const preview = screen.getByRole("img", { name: "Magnified preview of Fireball" });
    expect(preview).toHaveStyle({
      width: `${CARD_WIDTH * MAGNIFY_SCALE}px`,
      height: `${CARD_HEIGHT * MAGNIFY_SCALE}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
    });
    expect(screen.getByText("Fireball")).toBeInTheDocument();
    expect(screen.getByText("spell")).toBeInTheDocument();
    expect(screen.getByText("Deal 3 damage.")).toHaveStyle({
      fontSize: `${MAX_BODY_FONT_SIZE * MAGNIFY_SCALE}px`,
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("never reveals the front of a face-down card", () => {
    const { container: dom } = render(
      <MagnifyPreview definition={definition} face="back" bounds={bounds} />,
    );

    expect(
      screen.getByRole("img", { name: "Magnified preview of a face-down card" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Fireball")).not.toBeInTheDocument();
    expect(screen.queryByText("Deal 3 damage.")).not.toBeInTheDocument();
    expect(dom.querySelector("img")).toBeNull();
  });

  it("derives its scale from the bounds it is given", () => {
    const doubled = getPreviewBounds({ x: 1000, y: 1000 }, container, 4);
    render(<MagnifyPreview definition={definition} face="front" bounds={doubled} />);

    expect(screen.getByRole("img", { name: /Fireball/ })).toHaveStyle({
      width: `${CARD_WIDTH * 4}px`,
      height: `${CARD_HEIGHT * 4}px`,
    });
    expect(screen.getByText("Deal 3 damage.")).toHaveStyle({
      fontSize: `${MAX_BODY_FONT_SIZE * 4}px`,
    });
  });
});
