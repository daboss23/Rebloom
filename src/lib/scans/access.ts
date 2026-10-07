import "server-only";
import type { Scan } from "@/lib/domain";
import { scanForReport } from "@/lib/report/load";
import { readSandboxId } from "@/lib/sandbox";
import { getStore } from "@/lib/store";

/** A scan is only visible to the browser sandbox that created it (DECISIONS D-013). */
export async function getOwnScan(id: string): Promise<Scan | null> {
  const [scan, sandboxId] = await Promise.all([getStore().getScan(id), readSandboxId()]);
  if (!scan || !sandboxId || scan.sandboxId !== sandboxId) return null;
  return scan;
}

/**
 * The scan a request may act on: its own browser's, or, with `?report=<token>`, one belonging to that report.
 * A progress scan is keyed by the report link, so a client can rescan from the email on any device (D-073).
 */
export async function scanForRequest(request: Request, id: string): Promise<Scan | null> {
  const token = new URL(request.url).searchParams.get("report");
  return token ? scanForReport(token, id) : getOwnScan(id);
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
