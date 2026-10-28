import { randomBytes } from "node:crypto";

export function slugify(name: string, fallback: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${base || fallback}-${randomBytes(3).toString("hex")}`;
}
