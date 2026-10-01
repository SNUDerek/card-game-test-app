/** Returns a uniformly random integer in [0, exclusiveMax). */
export type RandomInt = (exclusiveMax: number) => number;

export const defaultRandomInt: RandomInt = (exclusiveMax) =>
  Math.floor(Math.random() * exclusiveMax);

/** Fisher-Yates over a copy; the input is left untouched. */
export function shuffled<T>(items: readonly T[], randomInt: RandomInt = defaultRandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
