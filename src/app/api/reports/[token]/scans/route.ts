import { lightMatch } from "@/lib/capture/gate";
import { newId } from "@/lib/ids";
import { loadReportData } from "@/lib/report/load";
import { sandboxNow } from "@/lib/sandbox";
import { json } from "@/lib/scans/access";
import { scanBody } from "@/lib/scans/input";
import { scanImagePath } from "@/lib/scans/service";
import { SCORED_CONCERNS } from "@/lib/skin/concerns";
import { getStorage, getStore } from "@/lib/store";

/**
 * A progress scan from the report link (DECISIONS D-073). The token is the key, as for the report itself: no
 * consent or questions again, and no gate, since the client opted in with their first scan.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/reports/[token]/scans">) {
  const { token } = await ctx.params;
  const parsed = scanBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Something about this photo didn't look right. Please retake it." }, 400);
  const data = await loadReportData(token);
  if (!data) return json({ error: "We couldn't find your report. Please open the link from your email again." }, 404);
  // A demo client's portrait isn't a scan: a rescan would put someone else's face in their story.
  if (data.client.demoKey) return json({ error: "This is a sample client. Take your own scan to try a progress scan." }, 409);

  const input = parsed.data;
  // Compared with scan 01's light. Outside tolerance it still runs, as a lower-confidence comparison (D-011).
  const baseline = data.scans[0].captureQuality;
  const sameLight = baseline !== null && lightMatch(baseline, input.quality).matches;
  const store = getStore();
  const imagePath = scanImagePath(data.client.id, newId());
  const created = await store.createScan(
    {
      clientId: data.client.id,
      sandboxId: data.client.sandboxId,
      imagePath,
      imageWidth: input.width,
      imageHeight: input.height,
      captureQuality: input.quality,
      landmarks: input.landmarks,
      concernsRequested: [...SCORED_CONCERNS],
    },
    await sandboxNow(),
  );
  const scan = await store.updateScan(created.id, { comparisonConfidence: sameLight && input.quality.passedGate ? "high" : "lower" });
  const upload = await getStorage().createUploadUrl(imagePath, "image/jpeg");
  return json({ scanId: scan.id, upload });
}
