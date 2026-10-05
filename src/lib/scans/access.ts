import "server-only";
import type { Scan } from "@/lib/domain";
import { readSandboxId } from "@/lib/sandbox";
import { getStore } from "@/lib/store";

/** A scan is only visible to the browser sandbox that created it (DECISIONS D-013). */
export async function getOwnScan(id: string): Promise<Scan | null> {
  const [scan, sandboxId] = await Promise.all([getStore().getScan(id), readSandboxId()]);
  if (!scan || !sandboxId || scan.sandboxId !== sandboxId) return null;
  return scan;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
