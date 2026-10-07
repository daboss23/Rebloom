import { requestIpHash } from "@/lib/sandbox";
import { json, scanForRequest } from "@/lib/scans/access";
import { startAnalysis } from "@/lib/scans/service";

// Live analysis uploads the photo to YouCam before it starts the task.
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/scans/[id]/analyze">) {
  const { id } = await ctx.params;
  const scan = await scanForRequest(request, id);
  if (!scan) return json({ error: "We couldn't find that scan." }, 404);
  const result = await startAnalysis(scan, { sandboxId: scan.sandboxId, ipHash: await requestIpHash() });
  return result.ok ? json({ ok: true }) : json({ error: result.error }, 409);
}
