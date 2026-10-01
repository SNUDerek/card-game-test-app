import type { NextFunction, Request, Response } from "express";
import { LibraryError } from "../library/errors.js";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function workspaceErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof LibraryError) {
    const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : 409;
    res.status(status).json({ error: error.message });
    return;
  }
  next(error);
}
