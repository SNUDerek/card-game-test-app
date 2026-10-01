import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiConflictError extends ApiError {
  constructor(message: string, code?: string) {
    super(409, message, code);
    this.name = "ApiConflictError";
  }
}

let onUnauthorized: (() => void) | undefined;

export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  onUnauthorized = handler;
}

export async function apiRequest<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  init?: RequestInit,
): Promise<z.infer<Schema>> {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  const body: unknown = response.status === 204
    ? undefined
    : await response.json().catch(() => ({}));

  if (!response.ok) {
    const details = typeof body === "object" && body !== null
      ? body as { error?: unknown; code?: unknown }
      : {};
    const message = typeof details.error === "string" ? details.error : `Request failed (${response.status}).`;
    const code = typeof details.code === "string" ? details.code : undefined;
    if (response.status === 401) onUnauthorized?.();
    if (response.status === 409) throw new ApiConflictError(message, code);
    throw new ApiError(response.status, message, code);
  }

  return schema.parse(body);
}
