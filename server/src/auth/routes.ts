import type { Application, Request, Response } from "express";
import express from "express";
import { LoginRequestSchema, RegisterRequestSchema, type CurrentUser } from "@card-table/shared";
import { hashPassword, secretsEqual, verifyPassword } from "./passwords.js";
import { AuthRateLimiter } from "./rate-limit.js";
import { findRequestUser, requireUser, type AuthenticatedRequest } from "./middleware.js";
import { SESSION_COOKIE, SESSION_LIFETIME_MS, type SessionRepository } from "./sessions.js";
import type { UserRepository } from "./users.js";

export interface AuthRouteOptions {
  users: UserRepository;
  sessions: SessionRepository;
  pepper: string;
  signupPasscode?: string;
  cookieSecure: boolean;
  /** Honor CF-Connecting-IP. Only safe when every request arrives through Cloudflare. */
  trustCloudflareIp?: boolean;
  rateLimiter?: AuthRateLimiter;
}

function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_LIFETIME_MS,
  });
}

function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure, path: "/" });
}

function clientIp(req: Request, trustCloudflareIp: boolean): string {
  const cloudflareIp = trustCloudflareIp ? req.header("CF-Connecting-IP")?.trim() : undefined;
  return cloudflareIp || req.ip || "unknown";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    String((error as { code: unknown }).code).startsWith("SQLITE_CONSTRAINT_UNIQUE");
}

export function registerAuthRoutes(app: Application, options: AuthRouteOptions): void {
  const limiter = options.rateLimiter ?? new AuthRateLimiter();
  const trustCloudflareIp = options.trustCloudflareIp ?? false;
  const json = express.json({ limit: "16kb", type: "application/json" });

  app.post("/api/auth/register", json, async (req, res) => {
    const parsed = RegisterRequestSchema.safeParse(req.body);
    const username = parsed.success ? parsed.data.username.toLocaleLowerCase() : "invalid";
    if (!limiter.allow([`ip:${clientIp(req, trustCloudflareIp)}`, `username:${username}`])) {
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid registration details.", issues: parsed.error.issues });
      return;
    }
    if (!options.signupPasscode) {
      res.status(403).json({ error: "Registration is disabled." });
      return;
    }
    if (!secretsEqual(parsed.data.signupCode, options.signupPasscode)) {
      res.status(403).json({ error: "Invalid signup code." });
      return;
    }
    const digest = await hashPassword(parsed.data.password, options.pepper);
    let user: CurrentUser;
    try {
      user = options.users.create({
        username: parsed.data.username,
        displayName: parsed.data.displayName,
        passwordHash: digest.hash,
        passwordSalt: digest.salt,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      res.status(409).json({ error: "That username is already in use." });
      return;
    }
    setSessionCookie(res, options.sessions.create(user.id), options.cookieSecure);
    res.status(201).json({ user });
  });

  app.post("/api/auth/login", json, async (req, res) => {
    const parsed = LoginRequestSchema.safeParse(req.body);
    const username = parsed.success ? parsed.data.username.toLocaleLowerCase() : "invalid";
    if (!limiter.allow([`ip:${clientIp(req, trustCloudflareIp)}`, `username:${username}`])) {
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid login details." });
      return;
    }
    const user = options.users.findByUsername(parsed.data.username);
    const valid = user && await verifyPassword(
      parsed.data.password,
      options.pepper,
      user.passwordHash,
      user.passwordSalt,
    );
    if (!user || !valid) {
      res.status(401).json({ error: "Invalid username or password." });
      return;
    }
    const currentUser: CurrentUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    };
    setSessionCookie(res, options.sessions.create(user.id), options.cookieSecure);
    res.json({ user: currentUser });
  });

  app.get("/api/auth/me", (req, res) => {
    const auth = findRequestUser(req.headers.cookie, options.sessions);
    if (!auth) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    res.json({ user: auth.user });
  });

  app.post("/api/auth/logout", requireUser(options.sessions), (req, res) => {
    options.sessions.revoke((req as AuthenticatedRequest).sessionToken);
    clearSessionCookie(res, options.cookieSecure);
    res.status(204).end();
  });
}

