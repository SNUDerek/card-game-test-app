import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "../../multiplayer/MultiplayerContext";
import { Lobby } from "./Lobby";

const createRoom = vi.fn().mockResolvedValue(undefined);
const joinRoom = vi.fn().mockResolvedValue(undefined);
const logout = vi.fn().mockResolvedValue(undefined);
const multiplayer = {
  status: "disconnected" as ConnectionStatus,
  invitedRoomId: null as string | null,
  connectionError: null as string | null,
  createRoom,
  joinRoom,
};

vi.mock("../../multiplayer/MultiplayerContext", () => ({
  useMultiplayer: () => multiplayer,
}));
vi.mock("../auth/AuthContext", () => ({
  useCurrentUser: () => ({ user: { id: "user-alice", username: "alice", displayName: "Alice" }, logout }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  multiplayer.status = "disconnected";
  multiplayer.invitedRoomId = null;
  multiplayer.connectionError = null;
});

function typeInto(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("Lobby", () => {
  it("creates a room as the signed-in account", () => {
    render(<Lobby />);

    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    expect(createRoom).toHaveBeenCalledWith();
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it("opens on the join form with the code from a shared link", () => {
    multiplayer.invitedRoomId = "KM7XPQ3D";
    render(<Lobby />);

    expect(screen.getByLabelText("Room code")).toHaveValue("KM7XPQ3D");
    fireEvent.click(screen.getByRole("button", { name: "Join room" }));

    expect(joinRoom).toHaveBeenCalledWith({ roomId: "KM7XPQ3D" });
  });

  it("requires a room code when joining", () => {
    render(<Lobby />);
    const submit = () => screen.getByRole("button", { name: /^(Create|Join) room$/ });
    expect(submit()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(submit()).toBeDisabled();

    typeInto("Room code", "KM7XPQ3D");
    expect(submit()).toBeEnabled();
  });

  it("reports a rejected connection and blocks resubmission while connecting", () => {
    multiplayer.status = "connecting";
    multiplayer.connectionError = "Could not connect.";
    render(<Lobby />);

    expect(screen.getByRole("alert")).toHaveTextContent("Could not connect.");
    expect(screen.getByRole("button", { name: "Connecting…" })).toBeDisabled();
  });
});
