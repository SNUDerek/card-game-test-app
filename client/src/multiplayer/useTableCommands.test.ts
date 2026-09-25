import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import type { TableRoom } from "./room";
import { NOT_CONNECTED_MESSAGE, useTableCommands } from "./useTableCommands";
import * as commands from "./commands";

vi.mock("./commands");

const room = { roomId: "KM7XPQ3D" } as unknown as TableRoom;

function roomRef(current: TableRoom | null) {
  const ref = createRef<TableRoom | null>() as { current: TableRoom | null };
  ref.current = current;
  return ref;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTableCommands", () => {
  it("binds the connected room into each command", async () => {
    vi.mocked(commands.flipCard).mockResolvedValue({ ok: true } as never);
    const { result } = renderHook(() => useTableCommands(roomRef(room)));

    await result.current.flipCard("c1");

    expect(commands.flipCard).toHaveBeenCalledWith(room, { cardId: "c1" });
  });

  it("passes payload commands through untouched", async () => {
    vi.mocked(commands.spawnCard).mockResolvedValue({ ok: true } as never);
    const payload = { definitionId: "spell-001", x: 10, y: 20 };
    const { result } = renderHook(() => useTableCommands(roomRef(room)));

    await result.current.spawnCard(payload);

    expect(commands.spawnCard).toHaveBeenCalledWith(room, payload);
  });

  it("defaults movement to the unconfirmed, fire-and-forget form", async () => {
    vi.mocked(commands.moveCard).mockResolvedValue(undefined);
    const payload = { cardId: "c1", x: 1, y: 2 };
    const { result } = renderHook(() => useTableCommands(roomRef(room)));

    await result.current.moveCard(payload);
    await result.current.moveCard(payload, true);

    expect(commands.moveCard).toHaveBeenNthCalledWith(1, room, payload, false);
    expect(commands.moveCard).toHaveBeenNthCalledWith(2, room, payload, true);
  });

  it("returns the claim result rather than discarding it", async () => {
    const claim = { granted: true, ownerPlayerId: "p1" };
    vi.mocked(commands.claimObject).mockResolvedValue(claim as never);
    const { result } = renderHook(() => useTableCommands(roomRef(room)));

    const object = { kind: "card", id: "c1" } as never;
    await expect(result.current.claimObject(object)).resolves.toEqual(claim);
    expect(commands.claimObject).toHaveBeenCalledWith(room, { object });
  });

  it("rejects every command while disconnected, without reaching the wire", async () => {
    const { result } = renderHook(() => useTableCommands(roomRef(null)));

    await expect(result.current.flipCard("c1")).rejects.toThrow(NOT_CONNECTED_MESSAGE);
    await expect(result.current.deleteStack("s1")).rejects.toThrow(NOT_CONNECTED_MESSAGE);
    expect(commands.flipCard).not.toHaveBeenCalled();
    expect(commands.deleteStack).not.toHaveBeenCalled();
  });

  it("keeps a stable identity across renders, so consumers do not re-render", () => {
    const ref = roomRef(room);
    const { result, rerender } = renderHook(() => useTableCommands(ref));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("reads the room through the ref, so a later connection needs no re-render", async () => {
    vi.mocked(commands.flipCard).mockResolvedValue({ ok: true } as never);
    const ref = roomRef(null);
    const { result } = renderHook(() => useTableCommands(ref));

    await expect(result.current.flipCard("c1")).rejects.toThrow(NOT_CONNECTED_MESSAGE);
    ref.current = room;
    await result.current.flipCard("c1");

    expect(commands.flipCard).toHaveBeenCalledWith(room, { cardId: "c1" });
  });
});
