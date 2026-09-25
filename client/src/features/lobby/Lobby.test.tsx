import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "../../multiplayer/MultiplayerContext";
import { Lobby } from "./Lobby";

const createRoom = vi.fn().mockResolvedValue(undefined);
const joinRoom = vi.fn().mockResolvedValue(undefined);
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
  it("creates a room with a trimmed display name and no password", () => {
    render(<Lobby />);
    typeInto("Display name", "  Alice  ");

    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    expect(createRoom).toHaveBeenCalledWith({ displayName: "Alice", password: undefined });
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it("passes an optional password when creating", () => {
    render(<Lobby />);
    typeInto("Display name", "Alice");
    typeInto(/^Password/, "open-sesame");

    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    expect(createRoom).toHaveBeenCalledWith({
      displayName: "Alice",
      password: "open-sesame",
    });
  });

  it("opens on the join form with the code from a shared link", () => {
    multiplayer.invitedRoomId = "KM7XPQ3D";
    render(<Lobby />);
    typeInto("Display name", "Bob");
    typeInto(/^Password/, "open-sesame");

    expect(screen.getByLabelText("Room code")).toHaveValue("KM7XPQ3D");
    fireEvent.click(screen.getByRole("button", { name: "Join room" }));

    expect(joinRoom).toHaveBeenCalledWith({
      displayName: "Bob",
      password: "open-sesame",
      roomId: "KM7XPQ3D",
    });
  });

  it("requires a display name, and a room code when joining", () => {
    render(<Lobby />);
    const submit = () => screen.getByRole("button", { name: /^(Create|Join) room$/ });
    expect(submit()).toBeDisabled();

    typeInto("Display name", "Alice");
    expect(submit()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(submit()).toBeDisabled();

    typeInto("Room code", "KM7XPQ3D");
    expect(submit()).toBeEnabled();
  });

  it("reports a rejected connection and blocks resubmission while connecting", () => {
    multiplayer.status = "connecting";
    multiplayer.connectionError = "Incorrect room password.";
    render(<Lobby />);
    typeInto("Display name", "Alice");

    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect room password.");
    expect(screen.getByRole("button", { name: "Connecting…" })).toBeDisabled();
  });
});
