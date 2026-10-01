/** A thrown value's message for display, or the fallback when it has none. */
export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
