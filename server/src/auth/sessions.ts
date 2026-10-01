import { createHash, randomBytes } from "node:crypto";
import type { CurrentUser } from "@card-table/shared";
import type { WorkspaceDatabase } from "../db/connection.js";

export const SESSION_COOKIE = "card_table_session";
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const SESSION_SLIDE_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

export interface SessionLookup {
  user: CurrentUser;
  slid: boolean;
}

interface SessionUserRow {
  id: string;
  username: string;
  display_name: string;
  expires_at: number;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export class SessionRepository {
  constructor(private readonly db: WorkspaceDatabase) {}

  create(userId: string, now = Date.now()): string {
    const token = randomBytes(32).toString("base64url");
    this.db.prepare(`
      INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(hashSessionToken(token), userId, now, now + SESSION_LIFETIME_MS);
    return token;
  }

  findUser(token: string, now = Date.now()): SessionLookup | undefined {
    const tokenHash = hashSessionToken(token);
    const row = this.db.prepare(`
      SELECT users.id, users.username, users.display_name, sessions.expires_at
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash, now) as SessionUserRow | undefined;
    if (!row) return undefined;
    const slid = row.expires_at - now < SESSION_SLIDE_WINDOW_MS;
    if (slid) {
      this.db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?")
        .run(now + SESSION_LIFETIME_MS, tokenHash);
    }
    return {
      user: { id: row.id, username: row.username, displayName: row.display_name },
      slid,
    };
  }

  revoke(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
  }

  deleteExpired(now = Date.now()): number {
    return this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now).changes;
  }
}
