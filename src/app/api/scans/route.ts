import { z } from "zod";
import { loadFlow, hasBiometricConsent } from "@/lib/flow/load";
import { newId } from "@/lib/ids";
import { readSandboxId, sandboxNow } from "@/lib/sandbox";
import { json } from "@/lib/scans/access";
import { scanImagePath } from "@/lib/scans/service";
import { scanBody } from "@/lib/scans/input";
import { SCORED_CONCERNS } from "@/lib/skin/concerns";
import { getStorage, getStore } from "@/lib/store";

const body = scanBody.extend({ clinicSlug: z.string().min(1).max(60) });

/** Creates a scan and returns a one-time URL the browser uploads the photo to directly. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Something about this photo didn't look right. Please retake it." }, 400);
  const input = parsed.data;

  const state = await loadFlow(input.clinicSlug);
  const sandboxId = await readSandboxId();
  if (!state.client || !sandboxId || !hasBiometricConsent(state)) {
    return json({ error: "Your session expired. Please start again from the beginning." }, 401);
  }
  if (!state.intake?.completedAt) return json({ error: "Please finish the questions first." }, 409);
  // A finished visit's next scan is a progress scan from its report link, never a second first scan.
  if (state.finished) return json({ error: "This visit is finished. Please start again." }, 409);

  const store = getStore();
  const imagePath = scanImagePath(state.client.id, newId());
  const scan = await store.createScan(
    {
      clientId: state.client.id,
      sandboxId,
      imagePath,
      imageWidth: input.width,
      imageHeight: input.height,
      captureQuality: input.quality,
      landmarks: input.landmarks,
      concernsRequested: [...SCORED_CONCERNS],
    },
    await sandboxNow(),
  );
  const upload = await getStorage().createUploadUrl(imagePath, "image/jpeg");
  return json({ scanId: scan.id, upload });
}
