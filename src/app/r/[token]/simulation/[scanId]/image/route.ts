import { scanForReport } from "@/lib/report/load";
import { getStorage } from "@/lib/store";
import { simulationPath } from "@/lib/store/scan-paths";

/** Serves the simulated image to whoever holds the report link. Private cache only. */
export async function GET(_request: Request, ctx: RouteContext<"/r/[token]/simulation/[scanId]/image">) {
  const { token, scanId } = await ctx.params;
  const scan = await scanForReport(token, scanId);
  const file = scan ? await getStorage().get(simulationPath(scan.imagePath)) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=300", "x-robots-tag": "noindex" },
  });
}
