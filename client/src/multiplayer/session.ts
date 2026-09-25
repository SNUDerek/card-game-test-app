import type { RoomId } from "@card-table/shared";

export const ROOM_PATH_PREFIX = "/room/";

/** Colyseus room ids are short random alphanumeric strings. */
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function isRoomId(value: string): value is RoomId {
  return ROOM_ID_PATTERN.test(value);
}

/** Reads the room id a shared URL points at, or null for the lobby. */
export function parseRoomIdFromPath(pathname: string): RoomId | null {
  if (!pathname.startsWith(ROOM_PATH_PREFIX)) return null;
  const candidate = pathname.slice(ROOM_PATH_PREFIX.length).replace(/\/+$/, "");
  return isRoomId(candidate) ? candidate : null;
}

export function roomPath(roomId: RoomId): string {
  return `${ROOM_PATH_PREFIX}${roomId}`;
}

export function roomJoinUrl(roomId: RoomId, origin: string): string {
  return `${origin}${roomPath(roomId)}`;
}

/**
 * Turns a connection failure into something worth showing a player. Colyseus
 * surfaces the server's ServerError message, so the checks stay on the text
 * the room actually sends.
 */
export function describeConnectionError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/password/i.test(message)) return "Incorrect room password.";
  if (/not found|expired/i.test(message)) return "That room no longer exists.";
  if (/display name/i.test(message)) return message;
  return "Could not reach the tabletop server.";
}
