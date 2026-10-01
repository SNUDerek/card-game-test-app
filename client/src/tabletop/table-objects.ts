import type { CardInstance, CardStack } from "@card-table/shared";

export const TABLE_BACKGROUND_COLOR = "#0b3d24";

export type TableObject =
  | { kind: "card"; zIndex: number; card: CardInstance }
  | { kind: "stack"; zIndex: number; stack: CardStack };

/**
 * Standalone cards and stacks, back to front. Stacked cards are drawn by their
 * stack, so they are not table objects of their own.
 */
export function tableObjectsInZOrder(
  cards: readonly CardInstance[],
  stacks: readonly CardStack[],
): TableObject[] {
  return [
    ...cards
      .filter((card) => card.stackId === undefined)
      .map((card) => ({ kind: "card" as const, zIndex: card.zIndex, card })),
    ...stacks.map((stack) => ({ kind: "stack" as const, zIndex: stack.zIndex, stack })),
  ].sort((a, b) => a.zIndex - b.zIndex);
}
