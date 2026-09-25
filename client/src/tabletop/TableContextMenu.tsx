import type { CardInstance, CardStack, DrawCardPayload } from "@card-table/shared";
import { getCardOrientationAction } from "./Card";

export interface CardMenuState {
  cardId: string;
  stackId?: string;
  x: number;
  y: number;
}

interface TableContextMenuCommands {
  tapCard(cardId: string): Promise<void>;
  untapCard(cardId: string): Promise<void>;
  drawCard(payload: DrawCardPayload): Promise<void>;
  deleteCard(cardId: string): Promise<void>;
  deleteStack(stackId: string): Promise<void>;
}

interface TableContextMenuProps {
  menu: CardMenuState;
  card: CardInstance;
  stack?: CardStack;
  commands: TableContextMenuCommands;
  onClose(): void;
}

function reportRejection(label: string, command: Promise<void>) {
  void command.catch((cause: unknown) => {
    console.warn(`${label} rejected:`, cause);
  });
}

export function TableContextMenu({ menu, card, stack, commands, onClose }: TableContextMenuProps) {
  const run = (label: string, command: Promise<void>) => {
    reportRejection(label, command);
    onClose();
  };

  return (
    <div
      className="card-context-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const command = getCardOrientationAction(card.orientation) === "untap"
            ? commands.untapCard(card.id)
            : commands.tapCard(card.id);
          run("Card orientation change", command);
        }}
      >
        {card.orientation === "tapped" ? "Untap" : "Tap"}
      </button>
      {stack && (
        <button
          type="button"
          role="menuitem"
          onClick={() => run("Draw top card", commands.drawCard({
            stackId: stack.id,
            x: stack.x + 60,
            y: stack.y + 60,
          }))}
        >
          Draw top card
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="danger"
        onClick={() => run("Card deletion", commands.deleteCard(card.id))}
      >
        Delete
      </button>
      {stack && (
        <button
          type="button"
          role="menuitem"
          className="danger"
          onClick={() => run("Stack deletion", commands.deleteStack(stack.id))}
        >
          Delete stack
        </button>
      )}
    </div>
  );
}
