import { json, scanForRequest } from "@/lib/scans/access";
import { advanceScan, viewScan } from "@/lib/scans/service";

// The poll that finds a live result also copies its masks into storage.
export const maxDuration = 60;

/** One poll step: at most one provider check per request. */
export async function GET(request: Request, ctx: RouteContext<"/api/scans/[id]/status">) {
  const { id } = await ctx.params;
  const scan = await scanForRequest(request, id);
  if (!scan) return json({ error: "We couldn't find that scan." }, 404);
  return json(await viewScan(await advanceScan(scan)));
}
