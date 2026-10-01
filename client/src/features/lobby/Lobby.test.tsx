import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "../../multiplayer/MultiplayerContext";
import { Lobby } from "./Lobby";

const createRoom = vi.fn().mockResolvedValue(undefined);
const joinRoom = vi.fn().mockResolvedValue(undefined);
const endRoom = vi.fn().mockResolvedValue(undefined);
const logout = vi.fn().mockResolvedValue(undefined);
const multiplayer = {
  status: "disconnected" as ConnectionStatus,
  invitedRoomId: null as string | null,
  connectionError: null as string | null,
  createRoom,
  joinRoom,
  endRoom,
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
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/rooms"
    ? json({ rooms: [{ id: "ROOM1", name: "Friday game", description: "Bring snacks", setName: "Skirmish",
      playerCount: 2, maxPlayers: 8 }] })
    : json({
      sets: [{ id: "set-1", name: "Skirmish", description: "", forkedFromSetId: null,
        forkedFromSetName: null, revision: 1, archived: false, cardCount: 0, deckCount: 0,
        createdAt: 1, updatedAt: 1 }],
    })));
});

function typeInto(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("Lobby", () => {
  it("puts card-set management in the workspace header outside the room form", () => {
    render(<Lobby />);

    const link = screen.getByRole("link", { name: "Card sets" });
    expect(link).toHaveAttribute("href", "/sets");
    expect(link.closest("form")).toBeNull();
    // No empty-workspace hint while the set list is still loading.
    expect(screen.queryByText(/before opening a room/)).toBeNull();
  });

  it("links to card-set creation when the workspace has no sets", async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/sets"
      ? json({ sets: [] })
      : json({ rooms: [] })));

    render(<Lobby />);

    expect(await screen.findByText(/before opening a room/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "card set" })).toHaveAttribute("href", "/sets");
  });

  it("creates a set-scoped room through the HTTP-backed flow", async () => {
    render(<Lobby />);
    await waitFor(() => expect(screen.getByLabelText("Card set")).toHaveValue("set-1"));
    typeInto("Room name", "Playtest");

    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    expect(createRoom).toHaveBeenCalledWith({ setId: "set-1", name: "Playtest" });
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it("opens on the join form with the code from a shared link", () => {
    multiplayer.invitedRoomId = "KM7XPQ3D";
    render(<Lobby />);

    expect(screen.getByLabelText("Room code")).toHaveValue("KM7XPQ3D");
    fireEvent.click(screen.getByRole("button", { name: "Join room" }));

    expect(joinRoom).toHaveBeenCalledWith({ roomId: "KM7XPQ3D" });
  });

  it("requires room details when creating and a room code when joining", async () => {
    render(<Lobby />);
    const submit = () => screen.getByRole("button", { name: /^(Create|Join) room$/ });
    expect(submit()).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText("Card set")).toHaveValue("set-1"));
    typeInto("Room name", "Playtest");
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

  it("passes an optional description when creating a room", async () => {
    render(<Lobby />);
    await waitFor(() => expect(screen.getByLabelText("Card set")).toHaveValue("set-1"));
    typeInto("Room name", "Playtest");
    typeInto(/Description/, "Round one");
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    expect(createRoom).toHaveBeenCalledWith({ setId: "set-1", name: "Playtest", description: "Round one" });
  });

  it("lists open rooms and joins one from the browser", async () => {
    render(<Lobby />);
    expect(await screen.findByText("Friday game")).toBeInTheDocument();
    expect(screen.getByText("Skirmish · 2/8 players")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Join Friday game" }));
    expect(joinRoom).toHaveBeenCalledWith({ roomId: "ROOM1" });
  });

  it("asks for confirmation before ending a room", async () => {
    render(<Lobby />);
    fireEvent.click(await screen.findByRole("button", { name: "End Friday game" }));
    expect(endRoom).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End room" }));
    await waitFor(() => expect(endRoom).toHaveBeenCalledWith("ROOM1"));
  });
});
