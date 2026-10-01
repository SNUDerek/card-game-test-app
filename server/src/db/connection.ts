import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const migrations = [
  {
    version: 1,
    filename: "001-initial.sql",
  },
] as const;

export type WorkspaceDatabase = Database.Database;

function migrationPath(filename: string): string {
  return path.join(import.meta.dirname, "migrations", filename);
}

export function migrateDatabase(db: WorkspaceDatabase): void {
  const currentVersion = db.pragma("user_version", { simple: true }) as number;
  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    const sql = fs.readFileSync(migrationPath(migration.filename), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
}

export function openDatabase(filename: string): WorkspaceDatabase {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrateDatabase(db);
  return db;
}

