/**
 * Per-player presence colours.
 *
 * Derived from `joinOrder`, which is server-assigned and synchronized, so every
 * client independently reaches the same colour for the same player without any
 * extra state on the wire. Players who leave do not free their slot, so colours
 * stay put for the life of the room rather than shuffling under everyone.
 */
export const PLAYER_COLORS = [
  "#38bdf8", // sky
  "#f472b6", // pink
  "#4ade80", // green
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#fb7185", // rose
  "#2dd4bf", // teal
  "#f97316", // orange
] as const;

export function playerColor(joinOrder: number): string {
  // Guards against a negative or fractional joinOrder reaching the palette.
  const index = Math.abs(Math.trunc(joinOrder)) % PLAYER_COLORS.length;
  return PLAYER_COLORS[index]!;
}
