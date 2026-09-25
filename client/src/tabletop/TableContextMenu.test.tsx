import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardInstance, CardStack } from "@card-table/shared";
import { TableContextMenu } from "./TableContextMenu";

const card: CardInstance = {
  id: "card-1",
  definitionId: "definition-1",
  face: "front",
  orientation: "upright",
  x: 10,
  y: 20,
  zIndex: 1,
};
const stack: CardStack = { id: "stack-1", x: 30, y: 40, cardIds: ["card-2", card.id], zIndex: 2 };
const commands = {
  tapCard: vi.fn().mockResolvedValue(undefined),
  untapCard: vi.fn().mockResolvedValue(undefined),
  drawCard: vi.fn().mockResolvedValue(undefined),
  shuffleStack: vi.fn().mockResolvedValue(undefined),
  deleteCard: vi.fn().mockResolvedValue(undefined),
  deleteStack: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => vi.clearAllMocks());

describe("TableContextMenu", () => {
  it("shows card actions and invokes the orientation command", () => {
    const onClose = vi.fn();
    render(<TableContextMenu
      menu={{ cardId: card.id, x: 100, y: 200 }}
      card={card}
      commands={commands}
      onClose={onClose}
    />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Tap" }));

    expect(commands.tapCard).toHaveBeenCalledWith(card.id);
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Draw top card" })).not.toBeInTheDocument();
  });

  it("shows stack actions and derives the draw position from live stack state", () => {
    render(<TableContextMenu
      menu={{ cardId: card.id, stackId: stack.id, x: 100, y: 200 }}
      card={{ ...card, stackId: stack.id }}
      stack={stack}
      commands={commands}
      onClose={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Draw top card" }));

    expect(commands.drawCard).toHaveBeenCalledWith({ stackId: stack.id, x: 90, y: 100 });
    expect(screen.getByRole("menuitem", { name: "Delete stack" })).toBeInTheDocument();
  });

  it("offers shuffle only for a stack", () => {
    const onClose = vi.fn();
    const { unmount } = render(<TableContextMenu
      menu={{ cardId: card.id, x: 100, y: 200 }}
      card={card}
      commands={commands}
      onClose={vi.fn()}
    />);
    expect(screen.queryByRole("menuitem", { name: "Shuffle" })).not.toBeInTheDocument();
    unmount();

    render(<TableContextMenu
      menu={{ cardId: card.id, stackId: stack.id, x: 100, y: 200 }}
      card={{ ...card, stackId: stack.id }}
      stack={stack}
      commands={commands}
      onClose={onClose}
    />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Shuffle" }));

    expect(commands.shuffleStack).toHaveBeenCalledWith(stack.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("reports rejected stack commands consistently", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    commands.deleteStack.mockRejectedValueOnce(new Error("locked"));
    render(<TableContextMenu
      menu={{ cardId: card.id, stackId: stack.id, x: 100, y: 200 }}
      card={{ ...card, stackId: stack.id }}
      stack={stack}
      commands={commands}
      onClose={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete stack" }));
    await vi.waitFor(() => expect(warning).toHaveBeenCalledWith(
      "Stack deletion rejected:", expect.any(Error),
    ));
  });
});
