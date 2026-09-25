import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CardDefinition } from "@card-table/shared";
import { CARD_HEIGHT, CARD_WIDTH } from "../../cards/CardRenderer";
import { MAGNIFY_SCALE } from "../../state/local-ui-state";
import { MAX_BODY_FONT_SIZE } from "../../cards/fit-text";
import { getPreviewSide, MagnifyPreview } from "./MagnifyPreview";

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

describe("getPreviewSide", () => {
  it("shows the preview opposite the card it describes", () => {
    expect(getPreviewSide(100, 1000)).toBe("right");
    expect(getPreviewSide(900, 1000)).toBe("left");
  });
});

describe("MagnifyPreview", () => {
  it("renders a face-up card magnified without any network traffic", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<MagnifyPreview definition={definition} face="front" side="right" />);

    const preview = screen.getByRole("img", { name: "Magnified preview of Fireball" });
    expect(preview).toHaveStyle({
      width: `${CARD_WIDTH * MAGNIFY_SCALE}px`,
      height: `${CARD_HEIGHT * MAGNIFY_SCALE}px`,
    });
    expect(preview).toHaveClass("magnify-preview-right");
    expect(screen.getByText("Fireball")).toBeInTheDocument();
    expect(screen.getByText("spell")).toBeInTheDocument();
    expect(screen.getByText("Deal 3 damage.")).toHaveStyle({
      fontSize: `${MAX_BODY_FONT_SIZE * MAGNIFY_SCALE}px`,
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("never reveals the front of a face-down card", () => {
    const { container } = render(
      <MagnifyPreview definition={definition} face="back" side="left" />,
    );

    expect(screen.getByRole("img", { name: "Magnified preview of a face-down card" }))
      .toHaveClass("magnify-preview-left");
    expect(screen.queryByText("Fireball")).not.toBeInTheDocument();
    expect(screen.queryByText("Deal 3 damage.")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("scales the rendered card at the requested factor", () => {
    render(<MagnifyPreview definition={definition} face="front" side="right" scale={2} />);

    expect(screen.getByRole("img", { name: /Fireball/ })).toHaveStyle({
      width: `${CARD_WIDTH * 2}px`,
      height: `${CARD_HEIGHT * 2}px`,
    });
  });
});
