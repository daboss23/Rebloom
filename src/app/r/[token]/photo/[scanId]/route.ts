import { scanForReport } from "@/lib/report/load";
import { getStorage } from "@/lib/store";
import { bundledPortraitUrl } from "@/lib/store/scan-paths";

/** Serves a scan photo to whoever holds the report link. Private cache only. */
export async function GET(request: Request, ctx: RouteContext<"/r/[token]/photo/[scanId]">) {
  const { token, scanId } = await ctx.params;
  const scan = await scanForReport(token, scanId);
  const file = scan ? await getStorage().get(scan.imagePath) : null;
  if (!file) {
    // A demo client's portrait comes with the app instead of from storage.
    const bundled = scan ? bundledPortraitUrl(scan.imagePath) : null;
    if (bundled) return Response.redirect(new URL(bundled, request.url), 307);
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(file.bytes), {
    headers: { "content-type": file.contentType, "cache-control": "private, max-age=300", "x-robots-tag": "noindex" },
  });
}
