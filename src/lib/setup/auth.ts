import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Setup routes answer only to `Authorization: Bearer <CRON_SECRET>` (DECISIONS D-044).
 * Without a CRON_SECRET they only answer in local development.
 */
export function setupAuthorized(request: Request): boolean {
  if (!env.CRON_SECRET) return env.NODE_ENV === "development";
  const given = request.headers.get("authorization") ?? "";
  // Compare digests so the check takes the same time whatever was sent.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(`Bearer ${env.CRON_SECRET}`));
}
