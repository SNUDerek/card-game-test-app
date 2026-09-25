import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@card-table/shared";
import { RoomHud } from "./RoomHud";

const leaveRoom = vi.fn().mockResolvedValue(undefined);
const multiplayer = {
  roomId: "KM7XPQ3D" as string | null,
  players: [] as Player[],
  hostPlayerId: "",
  selfPlayerId: null as string | null,
  leaveRoom,
};

vi.mock("../../multiplayer/MultiplayerContext", () => ({
  useMultiplayer: () => multiplayer,
}));

const alice: Player = { id: "p-alice", displayName: "Alice", connected: true, joinOrder: 0 };
const bob: Player = { id: "p-bob", displayName: "Bob", connected: true, joinOrder: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  multiplayer.roomId = "KM7XPQ3D";
  multiplayer.players = [alice, bob];
  multiplayer.hostPlayerId = "p-alice";
  multiplayer.selfPlayerId = "p-bob";
});

function playerRow(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement;
}

describe("RoomHud", () => {
  it("marks the host by comparing ids, wherever the host sits in the roster", () => {
    const { rerender } = render(<RoomHud />);

    expect(within(playerRow("Alice")).getByText("host")).toBeInTheDocument();
    expect(within(playerRow("Bob")).queryByText("host")).not.toBeInTheDocument();
    expect(within(playerRow("Bob")).getByText("you")).toBeInTheDocument();

    multiplayer.hostPlayerId = "p-bob";
    rerender(<RoomHud />);

    expect(within(playerRow("Bob")).getByText("host")).toBeInTheDocument();
    expect(within(playerRow("Alice")).queryByText("host")).not.toBeInTheDocument();
  });

  it("shows a disconnected player as reconnecting", () => {
    multiplayer.players = [alice, { ...bob, connected: false }];
    render(<RoomHud />);

    expect(playerRow("Bob")).toHaveTextContent("reconnecting…");
    expect(playerRow("Bob")).toHaveClass("is-away");
  });

  it("shows the room code and copies a shareable link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<RoomHud />);

    expect(screen.getByText("KM7XPQ3D")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/room/KM7XPQ3D`);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("leaves the room on request and renders nothing without one", () => {
    render(<RoomHud />);
    fireEvent.click(screen.getByRole("button", { name: "Leave room" }));
    expect(leaveRoom).toHaveBeenCalled();

    multiplayer.roomId = null;
    const { container } = render(<RoomHud />);
    expect(container).toBeEmptyDOMElement();
  });
});
