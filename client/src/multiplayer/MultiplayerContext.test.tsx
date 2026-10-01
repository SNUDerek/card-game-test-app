import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiplayerProvider, useMultiplayer } from "./MultiplayerContext";
import { storeSession } from "./session";

const sdk = vi.hoisted(() => ({
  joinById: vi.fn(),
  reconnect: vi.fn(),
}));

vi.mock("@colyseus/sdk", () => ({
  Client: class {
    joinById = sdk.joinById;
    reconnect = sdk.reconnect;
  },
}));

function fakeRoom(roomId: string, reconnectionToken: string) {
  return {
    roomId,
    reconnectionToken,
    state: {},
    onStateChange: vi.fn(),
    onLeave: vi.fn(),
    onMessage: vi.fn(),
    request: vi.fn(() => new Promise(() => undefined)),
    leave: vi.fn(async () => undefined),
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <Router><MultiplayerProvider>{children}</MultiplayerProvider></Router>
);

beforeEach(() => {
  sessionStorage.clear();
  sdk.joinById.mockReset();
  sdk.reconnect.mockReset();
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("MultiplayerProvider routing", () => {
  it("navigates to the room after joining without reconnecting to it", async () => {
    window.history.replaceState({}, "", "/");
    sdk.joinById.mockResolvedValue(fakeRoom("ROOM1", "ROOM1:token"));
    const { result } = renderHook(() => useMultiplayer(), { wrapper });

    await act(() => result.current.joinRoom({ roomId: "ROOM1" }));

    expect(window.location.pathname).toBe("/rooms/ROOM1");
    expect(result.current.status).toBe("connected");
    expect(sdk.reconnect).not.toHaveBeenCalled();
  });

  it("resumes a stored seat once when a reload lands on a room link", async () => {
    window.history.replaceState({}, "", "/rooms/ROOM1");
    storeSession({ roomId: "ROOM1", reconnectionToken: "ROOM1:token" });
    const room = fakeRoom("ROOM1", "ROOM1:token2");
    sdk.reconnect.mockResolvedValue(room);
    const { result } = renderHook(() => useMultiplayer(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(sdk.reconnect).toHaveBeenCalledOnce();
    expect(room.leave).not.toHaveBeenCalled();
  });
});
