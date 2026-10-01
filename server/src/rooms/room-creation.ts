import { randomUUID } from "node:crypto";

/** One-use proof that a room was created by the authenticated HTTP endpoint. */
export class RoomCreationRegistry {
  private readonly pending = new Map<string, { setId: string; expiresAt: number }>();

  issue(setId: string, now = Date.now()): string {
    for (const [token, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(token);
    }
    const token = randomUUID();
    this.pending.set(token, { setId, expiresAt: now + 30_000 });
    return token;
  }

  consume(token: string | undefined, setId: string | undefined, now = Date.now()): boolean {
    if (!token || !setId) return false;
    const pending = this.pending.get(token);
    this.pending.delete(token);
    return pending !== undefined && pending.setId === setId && pending.expiresAt > now;
  }

  revoke(token: string): void { this.pending.delete(token); }

  /** Exposed for diagnostics and leak-focused tests. */
  get pendingCount(): number { return this.pending.size; }
}
