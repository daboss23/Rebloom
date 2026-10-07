import { demoLandmarksFor } from "@/lib/demo/landmarks";
import { scanForReport } from "@/lib/report/load";
import { renderFixtureMask } from "@/lib/skin/fixture-masks";
import { getStorage } from "@/lib/store";
import { SHARED_DEMO_PREFIX } from "@/lib/store/scan-paths";

export async function GET(_request: Request, ctx: RouteContext<"/r/[token]/mask/[scanId]/[concern]">) {
  const { token, scanId, concern } = await ctx.params;
  const scan = await scanForReport(token, scanId);
  const found = scan?.result?.concerns.find((c) => c.key === concern);
  const path = found?.maskPath;
  if (!scan || !found || !path) return new Response("Not found", { status: 404 });
  // A demo client's marks are drawn from the portrait's landmarks on request, never stored (D-070).
  const landmarks = path.startsWith(SHARED_DEMO_PREFIX) ? demoLandmarksFor(path) : null;
  const bytes = path.startsWith(SHARED_DEMO_PREFIX)
    ? landmarks && (await renderFixtureMask({ seed: path, concern: found.key, ui: found.ui, landmarks, width: scan.imageWidth, height: scan.imageHeight }))
    : (await getStorage().get(path))?.bytes;
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=300", "x-robots-tag": "noindex" },
  });
}
