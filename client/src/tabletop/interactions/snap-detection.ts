import type { CardInstance, CardStack } from "@card-table/shared";
import { CARD_HEIGHT, CARD_WIDTH } from "../../cards/CardRenderer";
import type { Point } from "../viewport";

export const STACK_OFFSET = 8;

export type StackTarget =
  | { kind: "card"; cardId: string }
  | { kind: "stack"; stackId: string };

export function findStackTarget(
  sourceCardId: string,
  position: Point,
  cards: readonly CardInstance[],
  stacks: readonly CardStack[],
): StackTarget | null {
  const withinCard = (x: number, y: number) =>
    Math.abs(position.x - x) <= CARD_WIDTH / 2 && Math.abs(position.y - y) <= CARD_HEIGHT / 2;
  const stack = [...stacks].reverse().find((candidate) => withinCard(
    candidate.x + (candidate.cardIds.length - 1) * STACK_OFFSET,
    candidate.y + (candidate.cardIds.length - 1) * STACK_OFFSET,
  ));
  if (stack) return { kind: "stack", stackId: stack.id };
  const card = [...cards].reverse().find((candidate) =>
    candidate.id !== sourceCardId && candidate.stackId === undefined && withinCard(candidate.x, candidate.y)
  );
  return card ? { kind: "card", cardId: card.id } : null;
}
