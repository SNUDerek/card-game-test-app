import { describe, expect, it } from "vitest";
import {
  describeConnectionError,
  parseRoomIdFromPath,
  roomJoinUrl,
  roomPath,
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
