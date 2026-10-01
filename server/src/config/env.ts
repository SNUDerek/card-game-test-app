import path from "node:path";

export const PORT = Number(process.env.PORT ?? 2567);
export const DATA_DIR = path.resolve(
  process.env.DATA_DIR ?? path.join(import.meta.dirname, "../../../data"),
);
export const DATABASE_FILE = path.join(DATA_DIR, "workspace.db");
export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const SAMPLE_CARDS_DIR = process.env.SAMPLE_CARDS_DIR === ""
  ? undefined
  : path.resolve(
    process.env.SAMPLE_CARDS_DIR ?? path.join(import.meta.dirname, "../../../cards"),
  );

export function requireAuthPepper(): string {
  const pepper = process.env.AUTH_PEPPER;
  if (!pepper) throw new Error("AUTH_PEPPER is required and must be a strong server secret.");
  return pepper;
}

export const SIGNUP_PASSCODE = process.env.SIGNUP_PASSCODE || undefined;
export const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
export const TRUST_CLOUDFLARE_IP = process.env.TRUST_CLOUDFLARE_IP === "true";

export function trustProxySetting(value = process.env.TRUST_PROXY): number | boolean | string {
  if (!value || value === "false") return false;
  if (value === "true") return true;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : value;
}
