import type { NextFunction, Request, Response } from "express";
import type { CurrentUser } from "@card-table/shared";
import { readCookie, SESSION_COOKIE, type SessionRepository } from "./sessions.js";

export interface AuthenticatedRequest extends Request {
  user: CurrentUser;
  sessionToken: string;
}

export function findRequestUser(
  cookieHeader: string | null | undefined,
  sessions: SessionRepository,
): { user: CurrentUser; token: string } | undefined {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return undefined;
  const user = sessions.findUser(token);
  return user ? { user, token } : undefined;
}

export function requireUser(sessions: SessionRepository) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = findRequestUser(req.headers.cookie, sessions);
    if (!auth) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    Object.assign(req, { user: auth.user, sessionToken: auth.token });
    next();
  };
}

