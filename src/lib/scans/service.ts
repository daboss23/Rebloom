import "server-only";
// The scan pipeline: start analysis, advance it one step per status poll, finalise once.
// Browser-driven polling keeps every server request short (DECISIONS D-019).

import type { Scan } from "@/lib/domain";
import { env } from "@/lib/env";
import { chooseAnalysisMode, type ModeReason } from "@/lib/limits";
import { sandboxNow } from "@/lib/sandbox";

import { renderFixtureMask } from "@/lib/skin/fixture-masks";
import { normalizeResult } from "@/lib/skin/normalize";
import { getStorage, getStore } from "@/lib/store";
import { friendlyError } from "@/lib/youcam/errors";
import { getProvider } from "@/lib/youcam";
import type { RawSkinResult } from "@/lib/youcam/types";
import { sdUnitCost } from "@/lib/youcam/units";

/** JPEG files start with FF D8 FF. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function scanImagePath(clientId: string, fileId: string): string {
  return `clients/${clientId}/scans/${fileId}.jpg`;
}

function maskPath(scan: Scan, concern: string): string {
  return scan.imagePath.replace(/\.jpg$/, `/masks/${concern}.png`);
}

export async function startAnalysis(
  scan: Scan,
  ctx: { sandboxId: string | null; ipHash: string | null },
): Promise<{ ok: true; reason: ModeReason } | { ok: false; error: string }> {
  const store = getStore();
  const image = await getStorage().get(scan.imagePath);
  if (!image) return { ok: false, error: "We didn't receive your photo. Please try again." };
  // A signed storage URL accepts any bytes labelled image/jpeg, so check what actually arrived.
  if (!isJpeg(image.bytes)) return { ok: false, error: "We couldn't read that photo. Please try again." };

  const { mode, reason } = await chooseAnalysisMode(ctx);
  const provider = getProvider(mode);
  // Claim the scan first, so a double tap can't start two analyses.
  const claimed = await store.transitionScan(scan.id, ["uploading", "uploaded"], {
    status: "analyzing",
    source: provider.mode,
    analysisStartedAt: new Date().toISOString(),
  });
  if (!claimed) return { ok: true, reason };

  try {
    const { taskId, units } = await provider.start({ scanId: scan.id, imagePath: scan.imagePath, concerns: scan.concernsRequested });
    await store.updateScan(scan.id, { providerTaskId: taskId });
    if (provider.mode === "live") {
      await store.logUsage({
        provider: "youcam",
        feature: "skin_analysis_sd",
        units: units || sdUnitCost(scan.concernsRequested.length + 1),
        taskId,
        sandboxId: ctx.sandboxId,
        ipHash: ctx.ipHash,
        createdAt: new Date().toISOString(),
      });
    }
    return { ok: true, reason };
  } catch {
    await store.updateScan(scan.id, { status: "failed", errorCode: "start_failed" });
    return { ok: false, error: "We couldn't start the analysis. Please try again." };
  }
}

/** Moves an analyzing scan forward by at most one provider check. */
export async function advanceScan(scan: Scan): Promise<Scan> {
  if (scan.status !== "analyzing" || !scan.providerTaskId || !scan.analysisStartedAt) return scan;
  const store = getStore();
  const provider = getProvider(scan.source);
  const outcome = await provider.poll({ taskId: scan.providerTaskId, scanId: scan.id, startedAt: new Date(scan.analysisStartedAt) });

  if (outcome.status === "running") return scan;
  if (outcome.status === "error") {
    return (await store.transitionScan(scan.id, ["analyzing"], { status: "failed", errorCode: outcome.code })) ?? scan;
  }

  // Only the request that wins this transition finalises.
  const claimed = await store.transitionScan(scan.id, ["analyzing"], { status: "finalizing", youcamRaw: outcome.raw });
  if (!claimed) return (await store.getScan(scan.id)) ?? scan;
  try {
    return await finalize(claimed, outcome.raw);
  } catch {
    return store.updateScan(scan.id, { status: "failed", errorCode: "finalize_failed" });
  }
}

async function finalize(scan: Scan, raw: RawSkinResult): Promise<Scan> {
  const store = getStore();
  const storage = getStorage();
  const result = normalizeResult(raw);

  if (scan.source === "fixture" && scan.landmarks) {
    // Draw demo masks on this person's own face geometry (DECISIONS D-020).
    await Promise.all(
      result.concerns.map(async (c) => {
        const png = await renderFixtureMask({
          seed: scan.id,
          concern: c.key,
          ui: c.ui,
          landmarks: scan.landmarks!,
          width: scan.imageWidth,
          height: scan.imageHeight,
        });
        const path = maskPath(scan, c.key);
        await storage.put(path, png, "image/png");
        c.maskPath = path;
      }),
    );
  }
  // Live: download YouCam's masks into our storage here (they expire after 24 hours).

  const now = await sandboxNow();
  const done = await store.updateScan(scan.id, { status: "complete", result, completedAt: now.toISOString() });
  await store.getOrCreateReport(scan.clientId, now);
  // The client becomes a lead at the report gate, once they leave contact details (see unlockReport).
  return done;
}

export interface ScanView {
  status: Scan["status"];
  stage: string;
  stageIndex: number;
  reportPath?: string;
  /** True when the scan is done but the client hasn't opted in yet, so the report stays behind the gate. */
  locked?: boolean;
  error?: { title: string; instruction: string };
  demo: boolean;
}

export const STAGES = ["Reading texture", "Mapping tone", "Measuring pores and lines", "Writing your report"] as const;

export async function viewScan(scan: Scan): Promise<ScanView> {
  const demo = scan.source === "fixture";
  if (scan.status === "complete") {
    const store = getStore();
    const client = await store.getClient(scan.clientId);
    // No report link leaves the server until the client has opted in at the gate.
    if (!client?.email) return { status: scan.status, stage: "Ready", stageIndex: STAGES.length, locked: true, demo };
    const report = await store.getOrCreateReport(scan.clientId, await sandboxNow());
    return { status: scan.status, stage: "Ready", stageIndex: STAGES.length, reportPath: `/r/${report.token}`, demo };
  }
  if (scan.status === "failed") {
    const e = friendlyError(scan.errorCode);
    return { status: scan.status, stage: "", stageIndex: 0, error: { title: e.title, instruction: e.instruction }, demo };
  }
  if (scan.status === "finalizing") return { status: scan.status, stage: STAGES[3], stageIndex: 3, demo };
  // Waiting on the analysis: move through the reading stages by elapsed time. Never a fake percentage.
  const elapsed = scan.analysisStartedAt ? Date.now() - new Date(scan.analysisStartedAt).getTime() : 0;
  const span = demo ? Math.max(3000, env.FIXTURE_DELAY_MS) : 18_000;
  const stageIndex = Math.min(2, Math.floor((elapsed / span) * 3));
  return { status: scan.status, stage: STAGES[stageIndex], stageIndex, demo };
}

