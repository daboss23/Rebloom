import { demoLandmarksFor } from "@/lib/demo/landmarks";
import { landingPreview } from "@/lib/landing/preview";
import { renderFixtureMask } from "@/lib/skin/fixture-masks";

/**
 * The landing hero's marks: the sample client's demo masks, drawn from their portrait's face as their own report
 * draws them (DECISIONS D-070, D-076). Demo data on an AI-generated portrait, so public and cacheable.
 */
export async function GET(_request: Request, ctx: RouteContext<"/landing/mask/[concern]">) {
  const { concern } = await ctx.params;
  const found = landingPreview().face?.priorities.find((p) => p.key === concern);
  const landmarks = found ? demoLandmarksFor(found.maskPath) : null;
  if (!found || !landmarks) return new Response("Not found", { status: 404 });
  const bytes = await renderFixtureMask({ seed: found.maskPath, concern: found.key, ui: found.ui, landmarks, width: found.width, height: found.height });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}
