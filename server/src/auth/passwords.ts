import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;

export interface PasswordDigest {
  hash: string;
  salt: string;
}

function passwordInput(password: string, pepper: string): string {
  return `${password}\0${pepper}`;
}

export async function hashPassword(password: string, pepper: string): Promise<PasswordDigest> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(passwordInput(password, pepper), salt, KEY_LENGTH)) as Buffer;
  return { hash: key.toString("hex"), salt };
}

export async function verifyPassword(
  password: string,
  pepper: string,
  expectedHash: string,
  salt: string,
): Promise<boolean> {
  const expected = Buffer.from(expectedHash, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = (await scrypt(passwordInput(password, pepper), salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(actual, expected);
}

export function secretsEqual(actual: string, expected: string): boolean {
  const actualDigest = Buffer.from(actual);
  const expectedDigest = Buffer.from(expected);
  return actualDigest.length === expectedDigest.length && timingSafeEqual(actualDigest, expectedDigest);
}

