import { useEffect, useRef, useState } from "react";
import type { CardInstance } from "@card-table/shared";
import type { Point } from "../viewport";

export const REMOTE_MOVE_INTERPOLATION_MS = 100;

export function interpolatePosition(from: Point, to: Point, progress: number): Point {
  const amount = Math.min(1, Math.max(0, progress));
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

const NO_LOCAL_CARDS: ReadonlySet<string> = new Set();

/**
 * Smooths remote card movement between authoritative positions.
 *
 * Cards this client is dragging are excluded: they are rendered from the drag's
 * own local position, and their authoritative position necessarily trails the
 * pointer by the move throttle plus a round-trip. Interpolating them anyway
 * left a stale animation in flight, so releasing a card — which hands rendering
 * back to this hook — snapped it to that stale point before sliding forward
 * again. Pinning them to the authoritative position instead makes the handoff
 * on release a no-op.
 */
export function useInterpolatedCardPositions(
  cards: CardInstance[],
  locallyDraggedIds: ReadonlySet<string> = NO_LOCAL_CARDS,
): Record<string, Point> {
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  // Read through a ref so a drag starting or ending mid-animation takes effect
  // on the next frame rather than waiting for the next patch.
  const locallyDraggedRef = useRef(locallyDraggedIds);
  locallyDraggedRef.current = locallyDraggedIds;

  useEffect(() => {
    const targets = Object.fromEntries(cards.map((card) => [card.id, { x: card.x, y: card.y }]));
    const starts = Object.fromEntries(
      cards.map((card) => [
        card.id,
        locallyDraggedRef.current.has(card.id)
          ? targets[card.id]!
          : positionsRef.current[card.id] ?? targets[card.id]!,
      ]),
    );
    setPositions(starts);

    let frame = 0;
    let startedAt: number | undefined;
    const tick = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = (timestamp - startedAt) / REMOTE_MOVE_INTERPOLATION_MS;
      setPositions(
        Object.fromEntries(
          cards.map((card) => [
            card.id,
            locallyDraggedRef.current.has(card.id)
              ? targets[card.id]!
              : interpolatePosition(starts[card.id]!, targets[card.id]!, progress),
          ]),
        ),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cards]);

  return positions;
}
