import type { CardInstance, CardStack } from "@card-table/shared";
import { CARD_HEIGHT, CARD_WIDTH } from "../../cards/CardRenderer";
import type { Point } from "../viewport";

export const STACK_OFFSET = 8;

export type StackTarget =
  | { kind: "card"; cardId: string }
  | { kind: "stack"; stackId: string };

export type ResolvedStackTarget =
  | { kind: "card"; card: CardInstance }
  | { kind: "stack"; stack: CardStack };

export function resolveStackTarget(
  target: StackTarget | null,
  cards: readonly CardInstance[],
  stacks: readonly CardStack[],
): ResolvedStackTarget | null {
  if (!target) return null;
  if (target.kind === "card") {
    const card = cards.find((candidate) => candidate.id === target.cardId);
    return card ? { kind: "card", card } : null;
  }
  const stack = stacks.find((candidate) => candidate.id === target.stackId);
  return stack ? { kind: "stack", stack } : null;
}

export function findStackTarget(
  sourceCardId: string,
  position: Point,
  cards: readonly CardInstance[],
  stacks: readonly CardStack[],
): StackTarget | null {
  const source = cards.find((card) => card.id === sourceCardId);
  if (!source) return null;
  const withinCard = (x: number, y: number) =>
    Math.abs(position.x - x) <= CARD_WIDTH / 2 && Math.abs(position.y - y) <= CARD_HEIGHT / 2;
  const stack = [...stacks].sort((a, b) => b.zIndex - a.zIndex).find((candidate) => {
    const top = cards.find((card) => card.id === candidate.cardIds.at(-1));
    return top?.face === source.face && withinCard(
      candidate.x + (candidate.cardIds.length - 1) * STACK_OFFSET,
      candidate.y + (candidate.cardIds.length - 1) * STACK_OFFSET,
    );
  });
  if (stack) return { kind: "stack", stackId: stack.id };
  const card = [...cards].sort((a, b) => b.zIndex - a.zIndex).find((candidate) =>
    candidate.id !== sourceCardId && candidate.stackId === undefined &&
      candidate.face === source.face && withinCard(candidate.x, candidate.y)
  );
  return card ? { kind: "card", cardId: card.id } : null;
}
