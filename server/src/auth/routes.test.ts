import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type WorkspaceDatabase } from "../db/connection.js";
import { UserRepository } from "./users.js";
import { SessionRepository } from "./sessions.js";
import { registerAuthRoutes } from "./routes.js";
import { requireUser } from "./middleware.js";

let server: Server | undefined;
let database: WorkspaceDatabase;
let baseUrl: string;

beforeEach(async () => {
  database = openDatabase(":memory:");
  const app = express();
  const sessions = new SessionRepository(database);
  registerAuthRoutes(app, {
    users: new UserRepository(database),
    sessions,
    pepper: "test-pepper",
    signupPasscode: "invite-only",
    cookieSecure: false,
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", requireUser(sessions));
  app.use("/images", requireUser(sessions));
  app.get("/api/cards", (_req, res) => res.json({ cards: [] }));
  app.get("/images/example", (_req, res) => res.send("image"));
  server = await new Promise<Server>((resolve) => {
    const running = app.listen(0, () => resolve(running));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  database.close();
  server = undefined;
});

async function post(path: string, body?: object, cookie?: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function sessionCookie(response: Response): string {
  const value = response.headers.get("set-cookie");
  if (!value) throw new Error("Expected a session cookie");
  return value.split(";", 1)[0]!;
}

describe("account routes", () => {
  it("registers, restores, logs out, and logs back in", async () => {
    const registration = await post("/api/auth/register", {
      username: "alice",
      displayName: "Alice",
      password: "correct horse battery staple",
      signupCode: "invite-only",
    });
    expect(registration.status).toBe(201);
    const cookie = sessionCookie(registration);

    const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { username: "alice", displayName: "Alice" } });

    expect((await post("/api/auth/logout", undefined, cookie)).status).toBe(204);
    expect((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status).toBe(401);

    const login = await post("/api/auth/login", { username: "ALICE", password: "correct horse battery staple" });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("rejects a bad signup code, duplicate username, and bad password", async () => {
    const account = { username: "alice", displayName: "Alice", password: "long-enough", signupCode: "invite-only" };
    expect((await post("/api/auth/register", { ...account, signupCode: "wrong" })).status).toBe(403);
    expect((await post("/api/auth/register", account)).status).toBe(201);
    expect((await post("/api/auth/register", { ...account, username: "ALICE" })).status).toBe(409);
    expect((await post("/api/auth/login", { username: "alice", password: "wrong" })).status).toBe(401);
  });

  it("does not let a spoofed CF-Connecting-IP bypass the per-IP limit", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await post(
        "/api/auth/register",
        { username: `guess${attempt}`, displayName: "Guess", password: "long-enough", signupCode: "wrong" },
        undefined,
        { "CF-Connecting-IP": `203.0.113.${attempt}` },
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 403)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("leaves only health, login, register, and me checks public", async () => {
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/auth/me`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/cards`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/sets`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/rooms`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/images`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/images/example`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/future-route`)).status).toBe(401);
  });
});
