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

export function useInterpolatedCardPositions(cards: CardInstance[]): Record<string, Point> {
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  useEffect(() => {
    const targets = Object.fromEntries(cards.map((card) => [card.id, { x: card.x, y: card.y }]));
    const starts = Object.fromEntries(
      cards.map((card) => [card.id, positionsRef.current[card.id] ?? targets[card.id]!]),
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
            interpolatePosition(starts[card.id]!, targets[card.id]!, progress),
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
