import type { Request } from "express";
import type { z } from "zod";
import type { AuthenticatedRequest } from "../auth/middleware.js";
import { HttpError } from "./errors.js";

export function parseRequest<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "Invalid request.", "invalid");
  return parsed.data;
}

export function requestUser(req: Request) {
  return (req as AuthenticatedRequest).user;
}
