// Daily job (vercel.json). Keeps the Supabase free plan from pausing during judging (DECISIONS D-023)
// and deletes sandboxes older than 30 days, photos first (D-013).
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { SANDBOX_TTL_DAYS } from "@/lib/sandbox";
import { json } from "@/lib/scans/access";
import { getStorage, getStore } from "@/lib/store";

const DAY_MS = 86_400_000;
const BATCH = 200;

/** Vercel sends `Authorization: Bearer $CRON_SECRET` with every cron call. */
function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${env.CRON_SECRET}`));
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  const store = getStore();
  // The query that counts as activity.
  const clinics = await store.listClinics();

  // Real time on purpose: retention is a privacy promise, not part of the demo calendar.
  const { ids, storagePaths } = await store.expiredSandboxes(new Date(Date.now() - SANDBOX_TTL_DAYS * DAY_MS), BATCH);
  await getStorage().remove(storagePaths);
  await store.deleteSandboxes(ids);

  return json({ ok: true, store: store.kind, clinics: clinics.length, sandboxesDeleted: ids.length, filesDeleted: storagePaths.length });
}
