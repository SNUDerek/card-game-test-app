import { ROOM_COMMANDS, TABLE_COMMANDS } from "@card-table/shared";

export const DEFAULT_ROOM_IDLE_TIMEOUT_MINUTES = 120;
export const ROOM_IDLE_WARNING_MS = 5 * 60_000;

/**
 * Commands that do not change the table, so they do not keep a room alive. A
 * forgotten tab can still hover and claim, but that must not hold a set usage
 * lock forever. Every other table command is a real change and counts.
 */
const NON_ACTIVITY_COMMANDS: ReadonlySet<string> = new Set([
  TABLE_COMMANDS.CLAIM_OBJECT,
  TABLE_COMMANDS.RELEASE_OBJECT,
  TABLE_COMMANDS.SET_HOVER,
  ROOM_COMMANDS.SESSION,
]);

export function countsAsActivity(commandName: string): boolean {
  return !NON_ACTIVITY_COMMANDS.has(commandName);
}

export interface IdleTimeoutOptions {
  timeoutMs: number;
  /** How long before the deadline members are warned. Clamped to the timeout. */
  warningMs?: number;
}

/** What the room should do after a `poll`. */
export type IdlePollResult =
  | { kind: "none" }
  /** Warn members once per idle period; `endsAt` lets clients show a countdown. */
  | { kind: "warn"; endsAt: number }
  | { kind: "expire" };

/**
 * Tracks how long a room has gone without a table change. It owns no timers:
 * the room calls `recordActivity` on each counting command (and on "Keep
 * open") and `poll` from its clock, so the logic stays testable with plain
 * numbers.
 */
export class RoomIdleTimeout {
  private readonly timeoutMs: number;
  private readonly warningMs: number;
  private lastActivityAt: number;
  private warned = false;

  constructor(options: IdleTimeoutOptions, now: number) {
    if (!(options.timeoutMs > 0)) throw new RangeError("Idle timeout must be positive.");
    this.timeoutMs = options.timeoutMs;
    this.warningMs = Math.min(options.warningMs ?? ROOM_IDLE_WARNING_MS, options.timeoutMs);
    this.lastActivityAt = now;
  }

  get endsAt(): number {
    return this.lastActivityAt + this.timeoutMs;
  }

  /**
   * Resets the idle clock. Returns true when this cancels a warning already
   * shown, so the room knows to tell members the room is staying open.
   */
  recordActivity(now: number): boolean {
    this.lastActivityAt = Math.max(this.lastActivityAt, now);
    const cancelledWarning = this.warned;
    this.warned = false;
    return cancelledWarning;
  }

  poll(now: number): IdlePollResult {
    if (now >= this.endsAt) return { kind: "expire" };
    if (!this.warned && now >= this.endsAt - this.warningMs) {
      this.warned = true;
      return { kind: "warn", endsAt: this.endsAt };
    }
    return { kind: "none" };
  }
}

/**
 * Reads ROOM_IDLE_TIMEOUT_MINUTES. Unset or blank means the default; anything
 * else unusable throws, so a typo fails at startup instead of silently.
 */
export function parseIdleTimeoutMinutes(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_ROOM_IDLE_TIMEOUT_MINUTES;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`ROOM_IDLE_TIMEOUT_MINUTES must be a positive number, got "${raw}".`);
  }
  return minutes;
}
