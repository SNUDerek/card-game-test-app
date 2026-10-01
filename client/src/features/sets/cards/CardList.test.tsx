import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cardDefinition } from "../../../test/card-definitions";
import { CardList } from "./CardList";

describe("CardList", () => {
  it("shows rules text and omits the rules element when it is empty", () => {
    render(<CardList
      cards={[
        cardDefinition({ id: "fireball", name: "Fireball", body: "Deal 3 damage." }),
        cardDefinition({ id: "blank", name: "Blank", body: "" }),
      ]}
      onEdit={vi.fn()}
      onNew={vi.fn()}
    />);

    expect(screen.getByText("Deal 3 damage.")).toHaveClass("card-tile-body");
    expect(screen.getByRole("button", { name: /Fireball/ })).toHaveAttribute("title", "Deal 3 damage.");
    expect(screen.getByRole("button", { name: /Blank/ }).querySelector(".card-tile-body")).toBeNull();
  });
});
