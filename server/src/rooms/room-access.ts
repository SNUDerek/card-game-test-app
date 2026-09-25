import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/**
 * A room password at rest. Rooms keep this server-side only: it is never part
 * of synchronized room state and never leaves the process.
 */
export interface RoomPasswordHash {
  salt: string;
  key: string;
}

export function hashRoomPassword(password: string): RoomPasswordHash {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  return { salt, key: scryptSync(password, salt, KEY_LENGTH).toString("hex") };
}

/**
 * Checks a supplied password against a room's stored hash. An unprotected room
 * accepts any connection, including one that needlessly supplies a password.
 */
export function verifyRoomPassword(
  stored: RoomPasswordHash | undefined,
  supplied: string | undefined,
): boolean {
  if (!stored) return true;
  if (!supplied) return false;

  const expected = Buffer.from(stored.key, "hex");
  const actual = scryptSync(supplied, stored.salt, expected.length);
  return timingSafeEqual(expected, actual);
}
