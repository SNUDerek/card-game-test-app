import { useCallback, useEffect, useRef } from "react";

interface HoverCommands {
  setHover(cardId: string | null): Promise<void>;
}

/**
 * Decides when a pointer's card changed, given raw enter/leave events.
 *
 * Moving between adjacent cards can deliver `enter(B)` before `leave(A)`, so a
 * leave only clears the hover when it names the card still believed to be
 * under the pointer. Returning `undefined` means "no change worth sending".
 */
export function nextHoveredCardId(
  current: string | null,
  event: { kind: "enter" | "leave"; cardId: string },
): string | null | undefined {
  if (event.kind === "enter") return event.cardId === current ? undefined : event.cardId;
  return event.cardId === current ? null : undefined;
}

/**
 * Reports which card this client's pointer is over.
 *
 * Only transitions are sent, so a pointer resting on a card produces no
 * traffic at all and crossing the table costs one small message per card.
 * Hover deliberately survives a drag: a card being moved is exactly the card
 * other players most want attributed.
 */
export function useHoverReporter(commands: HoverCommands) {
  const hoveredRef = useRef<string | null>(null);
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const send = useCallback((cardId: string | null) => {
    hoveredRef.current = cardId;
    void commandsRef.current.setHover(cardId).catch((cause: unknown) => {
      console.warn("Hover report rejected:", cause);
    });
  }, []);

  const report = useCallback(
    (kind: "enter" | "leave", cardId: string) => {
      const next = nextHoveredCardId(hoveredRef.current, { kind, cardId });
      if (next !== undefined) send(next);
    },
    [send],
  );

  const hoverStart = useCallback((cardId: string) => report("enter", cardId), [report]);
  const hoverEnd = useCallback((cardId: string) => report("leave", cardId), [report]);

  // A pointer that left with the tabletop must not stay parked on a card.
  useEffect(
    () => () => {
      if (hoveredRef.current !== null) {
        void commandsRef.current.setHover(null).catch(() => undefined);
      }
    },
    [],
  );

  return { hoverStart, hoverEnd };
}
