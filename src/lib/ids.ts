import { createHash, randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

/** Unguessable URL token (192 bits). Used for private report links. */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Deterministic UUID-shaped id for seed data, so ids stay stable across reseeds. */
export function stableId(name: string): string {
  const h = createHash("sha1").update(`rebloom:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
