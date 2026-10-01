import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@card-table/shared";
import { RoomHud } from "./RoomHud";

const leaveRoom = vi.fn().mockResolvedValue(undefined);
const endRoom = vi.fn().mockResolvedValue(undefined);
const updateRoomDetails = vi.fn().mockResolvedValue(undefined);
const multiplayer = {
  roomId: "KM7XPQ3D" as string | null,
  roomName: "Friday game",
  roomDescription: "Bring snacks",
  players: [] as Player[],
  selfPlayerId: null as string | null,
  leaveRoom,
  endRoom,
  updateRoomDetails,
};

vi.mock("../../multiplayer/MultiplayerContext", () => ({
  useMultiplayer: () => multiplayer,
}));

const boardImage = {
  download: vi.fn().mockResolvedValue(undefined),
  isExporting: false,
  error: null as string | null,
};

vi.mock("../../tabletop/board-export/useBoardImageDownload", () => ({
  useBoardImageDownload: () => boardImage,
}));

const alice: Player = { id: "p-alice", userId: "u-alice", displayName: "Alice", connected: true, joinOrder: 0 };
const bob: Player = { id: "p-bob", userId: "u-bob", displayName: "Bob", connected: true, joinOrder: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  multiplayer.roomId = "KM7XPQ3D";
  multiplayer.players = [alice, bob];
  multiplayer.selfPlayerId = "p-bob";
  boardImage.isExporting = false;
  boardImage.error = null;
});

function playerRow(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement;
}

describe("RoomHud", () => {
  it("marks the current player without assigning a room host", () => {
    render(<RoomHud />);

    expect(within(playerRow("Bob")).getByText("you")).toBeInTheDocument();
    expect(screen.queryByText("host")).not.toBeInTheDocument();
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

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/rooms/KM7XPQ3D`);
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

  it("downloads a board image and reports progress and failure", () => {
    const { rerender } = render(<RoomHud />);
    fireEvent.click(screen.getByRole("button", { name: "Download board image" }));
    expect(boardImage.download).toHaveBeenCalled();

    boardImage.isExporting = true;
    rerender(<RoomHud />);
    expect(screen.getByRole("button", { name: "Preparing image…" })).toBeDisabled();

    boardImage.isExporting = false;
    boardImage.error = "2 card images could not be loaded.";
    rerender(<RoomHud />);
    expect(screen.getByRole("alert")).toHaveTextContent("2 card images could not be loaded.");
  });

  it("shows the room name and description, and saves edits", async () => {
    render(<RoomHud />);
    expect(screen.getByText("Friday game")).toBeInTheDocument();
    expect(screen.getByText("Bring snacks")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Saturday game" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateRoomDetails).toHaveBeenCalledWith({
      name: "Saturday game", description: "Bring snacks",
    }));
  });

  it("confirms before ending the room", async () => {
    render(<RoomHud />);
    fireEvent.click(screen.getByRole("button", { name: "End room" }));
    expect(endRoom).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "End room" }));
    await waitFor(() => expect(endRoom).toHaveBeenCalledWith("KM7XPQ3D"));
  });

  it("warns the last person before leaving and offers a board image", () => {
    multiplayer.players = [{ ...alice, connected: false }, bob];
    render(<RoomHud />);

    fireEvent.click(screen.getByRole("button", { name: "Leave room" }));
    expect(leaveRoom).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Download board image" }));
    expect(boardImage.download).toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Leave room" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Leave" }));
    expect(leaveRoom).toHaveBeenCalled();
  });

  it("asks the browser to confirm closing only when alone", () => {
    const { unmount } = render(<RoomHud />);
    const withCompany = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(withCompany);
    expect(withCompany.defaultPrevented).toBe(false);
    unmount();

    multiplayer.players = [bob];
    render(<RoomHud />);
    const alone = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(alone);
    expect(alone.defaultPrevented).toBe(true);
  });
});
