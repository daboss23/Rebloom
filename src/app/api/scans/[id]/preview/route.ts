import sharp from "sharp";
import { getOwnScan } from "@/lib/scans/access";
import { getStorage } from "@/lib/store";

/**
 * The photo behind the report gate, blurred on the server. The sharp original only reaches the
 * browser through the report link, after opt-in.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/scans/[id]/preview">) {
  const { id } = await ctx.params;
  const scan = await getOwnScan(id);
  const file = scan?.status === "complete" ? await getStorage().get(scan.imagePath) : null;
  if (!file) return new Response("Not found", { status: 404 });
  const blurred = await sharp(file.bytes).resize({ width: 240 }).blur(12).jpeg({ quality: 60 }).toBuffer();
  return new Response(new Uint8Array(blurred), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, no-store", "x-robots-tag": "noindex" },
  });
}
