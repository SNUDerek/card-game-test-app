/**
 * Domain failures from library operations. Routes map `code` to an HTTP status:
 * not_found → 404, stale_revision and conflict → 409, invalid → 400.
 */
export type LibraryErrorCode = "not_found" | "stale_revision" | "conflict" | "in_use" | "invalid";

export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LibraryError";
  }
}

/**
 * After an `UPDATE ... WHERE id = ? AND revision = ?` changed nothing, tells a
 * missing row apart from a stale revision.
 */
export function revisionMismatch(exists: boolean, what: string): LibraryError {
  return exists
    ? new LibraryError("stale_revision", `${what} was changed by someone else. Reload and try again.`)
    : new LibraryError("not_found", `${what} not found.`);
}
