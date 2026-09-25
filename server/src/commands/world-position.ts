import { WORLD_COORDINATE_LIMIT } from "@card-table/shared";
import { DomainCommandError } from "./errors.js";

/**
 * Domain bound shared by every position-bearing command.
 *
 * Zod already rejects NaN/Infinity structurally at the room boundary, but the
 * domain functions are callable directly, so the finite check is repeated here
 * rather than assumed. The magnitude bound keeps a structurally valid float
 * from parking an object where no one can ever reach it again.
 */
export function assertWorldPosition(
  position: { x: number; y: number },
  subject: "Card" | "Stack" = "Card",
): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new DomainCommandError(`${subject} position must be a finite coordinate.`);
  }
  if (
    Math.abs(position.x) > WORLD_COORDINATE_LIMIT ||
    Math.abs(position.y) > WORLD_COORDINATE_LIMIT
  ) {
    throw new DomainCommandError(
      `${subject} position must be within ±${WORLD_COORDINATE_LIMIT} world units.`,
    );
  }
}
