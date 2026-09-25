import { useCallback, useEffect, useRef, useState } from "react";
import type { MoveCardPayload, StackCardPayload, TableObjectRef } from "@card-table/shared";
import type { Point } from "../viewport";

export const MOVE_INTERVAL_MS = 50;

interface DragCommands {
  claimObject(object: TableObjectRef): Promise<unknown>;
  moveCard(payload: MoveCardPayload, confirmed?: boolean): Promise<void>;
  releaseObject(object: TableObjectRef): Promise<void>;
  stackCard(payload: StackCardPayload): Promise<void>;
}

interface DragSession {
  claimed: boolean;
  latest: Point;
  lastSentAt: number;
  claimPromise: Promise<boolean>;
}

export function shouldSendMove(lastSentAt: number, now: number): boolean {
  return now - lastSentAt >= MOVE_INTERVAL_MS;
}

export function useCardDrag(commands: DragCommands) {
  const [localPositions, setLocalPositions] = useState<Record<string, Point>>({});
  const sessions = useRef(new Map<string, DragSession>());
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const clearLocalPosition = useCallback((cardId: string) => {
    setLocalPositions((current) => {
      if (!(cardId in current)) return current;
      const next = { ...current };
      delete next[cardId];
      return next;
    });
  }, []);

  const startDrag = useCallback(
    (cardId: string, position: Point) => {
      const object = { kind: "card", id: cardId } as const;
      const session: DragSession = {
        claimed: false,
        latest: position,
        lastSentAt: 0,
        claimPromise: Promise.resolve(false),
      };
      session.claimPromise = commandsRef.current
        .claimObject(object)
        .then(() => {
          session.claimed = true;
          session.lastSentAt = performance.now();
          return true;
        })
        .catch((cause: unknown) => {
          console.warn("Card claim rejected:", cause);
          sessions.current.delete(cardId);
          clearLocalPosition(cardId);
          return false;
        });
      sessions.current.set(cardId, session);
    },
    [clearLocalPosition],
  );

  const moveDrag = useCallback((cardId: string, position: Point) => {
    const session = sessions.current.get(cardId);
    if (!session) return;
    session.latest = position;
    setLocalPositions((current) => ({ ...current, [cardId]: position }));

    const now = performance.now();
    if (session.claimed && shouldSendMove(session.lastSentAt, now)) {
      session.lastSentAt = now;
      void commandsRef.current.moveCard({ cardId, ...position }).catch((cause: unknown) => {
        console.warn("Intermediate card move rejected:", cause);
      });
    }
  }, []);

  const endDrag = useCallback(
    async (cardId: string, position: Point, target?: StackCardPayload["target"] | null) => {
      const session = sessions.current.get(cardId);
      if (!session) return;
      session.latest = position;
      setLocalPositions((current) => ({ ...current, [cardId]: position }));

      if (!(await session.claimPromise)) return;
      const object = { kind: "card", id: cardId } as const;
      try {
        if (target) await commandsRef.current.stackCard({ cardId, target });
        else await commandsRef.current.moveCard({ cardId, ...session.latest }, true);
      } catch (cause) {
        console.warn("Final card move rejected:", cause);
        clearLocalPosition(cardId);
      } finally {
        sessions.current.delete(cardId);
        await commandsRef.current.releaseObject(object).catch((cause: unknown) => {
          console.warn("Card lock release failed:", cause);
        });
      }
    },
    [clearLocalPosition],
  );

  useEffect(
    () => () => {
      for (const [cardId, session] of sessions.current) {
        void session.claimPromise.then((claimed) => {
          if (claimed) {
            return commandsRef.current.releaseObject({ kind: "card", id: cardId });
          }
        }).catch((cause: unknown) => {
          console.warn("Card lock cleanup failed:", cause);
        });
      }
      sessions.current.clear();
    },
    [],
  );

  return { localPositions, startDrag, moveDrag, endDrag, clearLocalPosition };
}
