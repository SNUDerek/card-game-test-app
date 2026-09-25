import path from "node:path";

export const PORT = Number(process.env.PORT ?? 2567);
export const CARDS_DIR = path.resolve(
  process.env.CARDS_DIR ?? path.join(import.meta.dirname, "../../../cards"),
);
