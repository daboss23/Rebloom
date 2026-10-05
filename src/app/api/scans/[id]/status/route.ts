import { getOwnScan, json } from "@/lib/scans/access";
import { advanceScan, viewScan } from "@/lib/scans/service";

/** One poll step: at most one provider check per request. */
export async function GET(_request: Request, ctx: RouteContext<"/api/scans/[id]/status">) {
  const { id } = await ctx.params;
  const scan = await getOwnScan(id);
  if (!scan) return json({ error: "We couldn't find that scan." }, 404);
  return json(await viewScan(await advanceScan(scan)));
}
