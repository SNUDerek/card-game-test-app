import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStoredSession,
  describeConnectionError,
  parseRoomIdFromPath,
  readStoredSession,
  roomJoinUrl,
  roomPath,
  storeSession,
} from "./session";

describe("room routes", () => {
  it.each([
    ["/room/KM7XPQ3D", "KM7XPQ3D"],
    ["/room/KM7XPQ3D/", "KM7XPQ3D"],
  ])("reads the room id out of %s", (pathname, expected) => {
    expect(parseRoomIdFromPath(pathname)).toBe(expected);
  });

  it.each([["/"], ["/room/"], ["/room/not a room id"], ["/rooms/KM7XPQ3D"], ["/lobby"]])(
    "treats %s as the lobby",
    (pathname) => {
      expect(parseRoomIdFromPath(pathname)).toBeNull();
    },
  );

  it("builds shareable room links", () => {
    expect(roomPath("KM7XPQ3D")).toBe("/room/KM7XPQ3D");
    expect(roomJoinUrl("KM7XPQ3D", "https://cards.example.com")).toBe(
      "https://cards.example.com/room/KM7XPQ3D",
    );
  });
});

describe("describeConnectionError", () => {
  it.each([
    [new Error("Incorrect room password."), "Incorrect room password."],
    [new Error('room "ABC123" not found'), "That room no longer exists."],
    [
      new Error("A display name between 1 and 50 characters is required."),
      "A display name between 1 and 50 characters is required.",
    ],
    [new Error("socket hang up"), "Could not reach the tabletop server."],
  ])("explains %s to the player", (cause, expected) => {
    expect(describeConnectionError(cause)).toBe(expected);
  });
});

describe("stored sessions", () => {
  const session = { roomId: "KM7XPQ3D", reconnectionToken: "KM7XPQ3D:abc123" };

  beforeEach(() => sessionStorage.clear());

  it("round-trips a session for the room it belongs to", () => {
    storeSession(session);

    expect(readStoredSession("KM7XPQ3D")).toEqual(session);
  });

  it("ignores a session stored for a different room", () => {
    storeSession(session);

    expect(readStoredSession("OTHER123")).toBeNull();
    expect(readStoredSession(null)).toBeNull();
  });

  it("ignores missing and malformed storage", () => {
    expect(readStoredSession("KM7XPQ3D")).toBeNull();

    sessionStorage.setItem("card-table-session", "{not json");
    expect(readStoredSession("KM7XPQ3D")).toBeNull();

    sessionStorage.setItem("card-table-session", JSON.stringify({ roomId: "KM7XPQ3D" }));
    expect(readStoredSession("KM7XPQ3D")).toBeNull();
  });

  it("forgets a session on request", () => {
    storeSession(session);
    clearStoredSession();

    expect(readStoredSession("KM7XPQ3D")).toBeNull();
  });
});
