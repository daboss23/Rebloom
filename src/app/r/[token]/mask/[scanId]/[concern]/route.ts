import { scanForReport } from "@/lib/report/load";
import { getStorage } from "@/lib/store";

export async function GET(_request: Request, ctx: RouteContext<"/r/[token]/mask/[scanId]/[concern]">) {
  const { token, scanId, concern } = await ctx.params;
  const scan = await scanForReport(token, scanId);
  const path = scan?.result?.concerns.find((c) => c.key === concern)?.maskPath;
  const file = path ? await getStorage().get(path) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=300", "x-robots-tag": "noindex" },
  });
}
