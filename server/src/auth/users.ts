import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@card-table/shared";
import type { WorkspaceDatabase } from "../db/connection.js";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
}

export interface UserWithPassword extends CurrentUser {
  passwordHash: string;
  passwordSalt: string;
}

function mapUser(row: UserRow): UserWithPassword {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
  };
}

export class UserRepository {
  constructor(private readonly db: WorkspaceDatabase) {}

  create(input: { username: string; displayName: string; passwordHash: string; passwordSalt: string }): CurrentUser {
    const user: CurrentUser = {
      id: randomUUID(),
      username: input.username,
      displayName: input.displayName,
    };
    this.db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, password_salt, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, user.username, user.displayName, input.passwordHash, input.passwordSalt, Date.now());
    return user;
  }

  findByUsername(username: string): UserWithPassword | undefined {
    const row = this.db.prepare(`
      SELECT id, username, display_name, password_hash, password_salt
      FROM users WHERE username = ? COLLATE NOCASE
    `).get(username) as UserRow | undefined;
    return row ? mapUser(row) : undefined;
  }

  displayName(id: string): string | undefined {
    const row = this.db.prepare("SELECT display_name FROM users WHERE id = ?").get(id) as
      | { display_name: string }
      | undefined;
    return row?.display_name;
  }
}

