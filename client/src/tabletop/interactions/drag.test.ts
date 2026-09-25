import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOVE_INTERVAL_MS, shouldSendMove, useCardDrag } from "./drag";

afterEach(() => vi.restoreAllMocks());

describe("drag movement throttling", () => {
  it("limits intermediate updates to approximately 20 Hz", () => {
    expect(shouldSendMove(100, 100 + MOVE_INTERVAL_MS - 1)).toBe(false);
    expect(shouldSendMove(100, 100 + MOVE_INTERVAL_MS)).toBe(true);
  });

  it("moves locally immediately, throttles updates, then confirms and releases", async () => {
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const commands = {
      claimObject: vi.fn().mockResolvedValue({ expiresAt: 5_000 }),
      moveCard: vi.fn().mockResolvedValue(undefined),
      releaseObject: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useCardDrag(commands));

    act(() => result.current.startDrag("card-1", { x: 0, y: 0 }));
    await act(async () => Promise.resolve());
    now = 149;
    act(() => result.current.moveDrag("card-1", { x: 10, y: 20 }));
    expect(result.current.localPositions["card-1"]).toEqual({ x: 10, y: 20 });
    expect(commands.moveCard).not.toHaveBeenCalled();

    now = 150;
    act(() => result.current.moveDrag("card-1", { x: 30, y: 40 }));
    expect(commands.moveCard).toHaveBeenCalledWith(
      { cardId: "card-1", x: 30, y: 40 },
    );

    await act(async () => result.current.endDrag("card-1", { x: 50, y: 60 }));
    expect(commands.moveCard).toHaveBeenLastCalledWith(
      { cardId: "card-1", x: 50, y: 60 },
      true,
    );
    expect(commands.releaseObject).toHaveBeenCalledWith({ kind: "card", id: "card-1" });
  });

  it("reverts the local position when a claim is rejected", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const commands = {
      claimObject: vi.fn().mockRejectedValue(new Error("claimed")),
      moveCard: vi.fn().mockResolvedValue(undefined),
      releaseObject: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useCardDrag(commands));

    act(() => {
      result.current.startDrag("card-1", { x: 0, y: 0 });
      result.current.moveDrag("card-1", { x: 10, y: 20 });
    });
    await act(async () => Promise.resolve());

    expect(result.current.localPositions["card-1"]).toBeUndefined();
    expect(commands.moveCard).not.toHaveBeenCalled();
  });
});
