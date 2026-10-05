import { scanForReport } from "@/lib/report/load";
import { getStorage } from "@/lib/store";

/** Serves a scan photo to whoever holds the report link. Private cache only. */
export async function GET(_request: Request, ctx: RouteContext<"/r/[token]/photo/[scanId]">) {
  const { token, scanId } = await ctx.params;
  const scan = await scanForReport(token, scanId);
  const file = scan ? await getStorage().get(scan.imagePath) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { "content-type": file.contentType, "cache-control": "private, max-age=300", "x-robots-tag": "noindex" },
  });
}
