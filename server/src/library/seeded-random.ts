import { randomBytes } from "node:crypto";
import type { RandomInt } from "../commands/random.js";

/** A short, URL-safe seed that is easy to read out or paste. */
export function createSeed(): string {
  return randomBytes(6).toString("base64url");
}

/**
 * Deterministic RandomInt for a string seed: an FNV-1a hash of the seed feeds a
 * mulberry32 generator. Not cryptographic; it only has to make a generated deck
 * reproducible from its seed.
 */
export function seededRandomInt(seed: string): RandomInt {
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 0x01000193);
  }

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return (exclusiveMax) => Math.floor(next() * exclusiveMax);
}
