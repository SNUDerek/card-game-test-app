import { useCallback, useRef, useState } from "react";
import type { MoveStackPayload, TableObjectRef } from "@card-table/shared";
import type { Point } from "../viewport";
import { MOVE_INTERVAL_MS, shouldSendMove } from "./drag";

interface Commands {
  claimObject(object: TableObjectRef): Promise<unknown>;
  moveStack(payload: MoveStackPayload, confirmed?: boolean): Promise<void>;
  releaseObject(object: TableObjectRef): Promise<void>;
}

export function useStackDrag(commands: Commands) {
  const [localPositions, setLocalPositions] = useState<Record<string, Point>>({});
  const sessions = useRef(new Map<string, { claimed: boolean; latest: Point; lastSentAt: number; claim: Promise<boolean> }>());
  const ref = useRef(commands); ref.current = commands;
  const startDrag = useCallback((stackId: string, position: Point) => {
    const session = { claimed: false, latest: position, lastSentAt: 0, claim: Promise.resolve(false) };
    session.claim = ref.current.claimObject({ kind: "stack", id: stackId }).then(() => {
      session.claimed = true; session.lastSentAt = performance.now(); return true;
    }).catch(() => false);
    sessions.current.set(stackId, session);
  }, []);
  const moveDrag = useCallback((stackId: string, position: Point) => {
    const session = sessions.current.get(stackId); if (!session) return;
    session.latest = position; setLocalPositions((current) => ({ ...current, [stackId]: position }));
    const now = performance.now();
    if (session.claimed && shouldSendMove(session.lastSentAt, now)) {
      session.lastSentAt = now;
      void ref.current.moveStack({ stackId, ...position });
    }
  }, []);
  const endDrag = useCallback(async (stackId: string, position: Point) => {
    const session = sessions.current.get(stackId); if (!session) return;
    session.latest = position;
    if (await session.claim) await ref.current.moveStack({ stackId, ...position }, true);
    sessions.current.delete(stackId);
    await ref.current.releaseObject({ kind: "stack", id: stackId }).catch(() => undefined);
    setLocalPositions((current) => { const next = { ...current }; delete next[stackId]; return next; });
  }, []);
  return { localPositions, startDrag, moveDrag, endDrag };
}
