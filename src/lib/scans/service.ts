import "server-only";
// The scan pipeline: start analysis, advance it one step per status poll, finalise once.
// Browser-driven polling keeps every server request short (DECISIONS D-019).

import type { Scan } from "@/lib/domain";
import { clinicSideLink } from "@/lib/dashboard/handoff";
import { env } from "@/lib/env";
import { chooseAnalysisMode, type ModeReason } from "@/lib/limits";
import { sandboxNow } from "@/lib/sandbox";

import { renderFixtureMask } from "@/lib/skin/fixture-masks";
import { copyLiveMask } from "@/lib/skin/live-masks";
import { normalizeResult } from "@/lib/skin/normalize";
import { getStorage, getStore } from "@/lib/store";
import { deleteTask, getFitzpatrickTask, YouCamError, type FitzpatrickTask } from "@/lib/youcam/client";
import { friendlyError } from "@/lib/youcam/errors";
import { getProvider } from "@/lib/youcam";
import { fixtureRescanResult } from "@/lib/youcam/fixture";
import { withoutMaskUrls } from "@/lib/youcam/parse";
import type { RawSkinResult } from "@/lib/youcam/types";
import { FITZPATRICK_UNITS, unitCost } from "@/lib/youcam/units";

/** A live analysis that hasn't finished by now is abandoned. YouCam usually takes 5 to 20 seconds. */
export const ANALYSIS_TIMEOUT_MS = 3 * 60_000;
/** A finalisation still running after this was cut off mid-way (the server stopped). */
const FINALIZE_STALE_MS = ANALYSIS_TIMEOUT_MS + 2 * 60_000;

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

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

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

  // A client's skin type is estimated once, on their first live scan, and kept (D-094).
  const client = provider.mode === "live" ? await store.getClient(scan.clientId) : null;
  const input = { scanId: scan.id, image, concerns: scan.concernsRequested, fitzpatrick: Boolean(client && !client.fitzpatrick) };
  try {
    const { taskId, units, engine = "sd", fitzpatrickTaskId = null } = await provider.start(input);
    await store.updateScan(scan.id, { providerTaskId: taskId, ...(fitzpatrickTaskId ? { fitzpatrickTaskId } : {}) });
    if (provider.mode === "live") {
      // Logged now so limits count the attempt. Released if the task fails: YouCam only charges for success.
      await store.logUsage({
        provider: "youcam",
        feature: `skin_analysis_${engine}`,
        units: units || unitCost(engine, scan.concernsRequested.length + 1),
        taskId,
        sandboxId: ctx.sandboxId,
        ipHash: ctx.ipHash,
        createdAt: new Date().toISOString(),
      });
    }
    return { ok: true, reason };
  } catch (error) {
    if (provider.mode === "live") {
      // YouCam is unreachable, out of units or refusing the key. Rather than a dead end, the scan runs
      // as a clearly labelled demo (DECISIONS D-022, D-042). The reason stays on the scan for the team.
      const kind = error instanceof YouCamError ? error.kind : "unexpected";
      console.error(`[youcam] scan ${scan.id}: couldn't start live analysis, using demo analysis instead (${describe(error)})`);
      try {
        const fallback = getProvider("fixture");
        const { taskId } = await fallback.start(input);
        await store.updateScan(scan.id, {
          source: fallback.mode,
          providerTaskId: taskId,
          analysisStartedAt: new Date().toISOString(),
          errorCode: `live_start_${kind}`,
        });
        return { ok: true, reason: "live_unavailable" };
      } catch {
        // Fall through to the failure below.
      }
    }
    await store.updateScan(scan.id, { status: "failed", errorCode: "start_failed" });
    return { ok: false, error: "We couldn't start the analysis. Please try again." };
  }
}

/** Deletes the task at YouCam once we hold our own copy, or once it can't be used. Never blocks a scan. */
async function releaseTask(scan: Scan): Promise<void> {
  const provider = getProvider(scan.source);
  if (!provider.release || !scan.providerTaskId) return;
  try {
    await provider.release(scan.providerTaskId);
  } catch (error) {
    console.warn(`[youcam] scan ${scan.id}: couldn't delete the task at YouCam (${describe(error)})`);
  }
}

/** Moves an analyzing scan forward by at most one provider check. */
export async function advanceScan(scan: Scan): Promise<Scan> {
  const store = getStore();
  const age = scan.analysisStartedAt ? Date.now() - new Date(scan.analysisStartedAt).getTime() : 0;

  if (scan.status === "finalizing") {
    if (age < FINALIZE_STALE_MS) return scan;
    return (await store.transitionScan(scan.id, ["finalizing"], { status: "failed", errorCode: "finalize_failed" })) ?? scan;
  }
  if (scan.status !== "analyzing" || !scan.providerTaskId || !scan.analysisStartedAt) return scan;

  const provider = getProvider(scan.source);
  // Live mode was switched off mid-scan. Never let demo results pass for a live reading.
  if (provider.mode !== scan.source) {
    return (await store.transitionScan(scan.id, ["analyzing"], { status: "failed", errorCode: "provider_unavailable" })) ?? scan;
  }
  const outcome =
    age > ANALYSIS_TIMEOUT_MS
      ? ({ status: "error", code: "analysis_timeout" } as const)
      : await provider.poll({ taskId: scan.providerTaskId, scanId: scan.id, startedAt: new Date(scan.analysisStartedAt) });

  if (outcome.status === "running") return scan;
  if (outcome.status === "error") {
    const failed = await store.transitionScan(scan.id, ["analyzing"], { status: "failed", errorCode: outcome.code });
    if (!failed) return (await store.getScan(scan.id)) ?? scan;
    if (scan.source === "live") {
      // YouCam charges nothing for a failed task. A timed-out one may still finish, so its units stay counted.
      if (outcome.code !== "analysis_timeout") {
        await store.settleUsage({ provider: "youcam", taskId: scan.providerTaskId }, 0);
      }
      await releaseTask(scan);
    }
    return failed;
  }

  // Only the request that wins this transition finalises.
  const claimed = await store.transitionScan(scan.id, ["analyzing"], { status: "finalizing", youcamRaw: withoutMaskUrls(outcome.raw) });
  if (!claimed) return (await store.getScan(scan.id)) ?? scan;
  try {
    return await finalize(claimed, outcome.raw);
  } catch (error) {
    console.error(`[scan] ${scan.id}: finalising failed (${describe(error)})`);
    return store.updateScan(scan.id, { status: "failed", errorCode: "finalize_failed" });
  }
}

async function finalize(scan: Scan, analysed: RawSkinResult): Promise<Scan> {
  const store = getStore();
  const storage = getStorage();
  const first = scan.scanNumber > 1 ? (await store.listScans(scan.clientId)).find((s) => s.scanNumber === 1) : undefined;
  // A demo-mode rescan starts from this person's first scores, so it can't invent progress (D-073).
  const raw = scan.source === "fixture" && first?.result ? fixtureRescanResult(scan.id, first.result) : analysed;
  const result = normalizeResult(raw);
  let skinType: Promise<void> = Promise.resolve();

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
  } else if (scan.source === "live") {
    // Read alongside the masks, so it adds no wait of its own.
    skinType = settleFitzpatrick(scan);
    // Copy YouCam's masks now: their links expire in about 2 hours. A mask that won't copy costs
    // that concern its overlay, never the scan: the scores are already safe.
    await Promise.all(
      result.concerns.map(async (c) => {
        // HD can send a whole-face mask and one per area; the same link may appear twice.
        const urls = [...new Set(raw.concerns[c.key]?.mask_urls ?? [])];
        if (urls.length === 0) return;
        try {
          const png = await copyLiveMask(urls, scan.imageWidth, scan.imageHeight);
          const path = maskPath(scan, c.key);
          await storage.put(path, png, "image/png");
          c.maskPath = path;
        } catch (error) {
          console.warn(`[youcam] scan ${scan.id}: ${c.key} mask not copied (${describe(error)})`);
        }
      }),
    );
  }

  await skinType;

  // A rescan compares like with like: a different source (demo or live) or engine (HD or SD) scores on a different
  // scale, so the comparison drops to lower confidence and earns no badges (DECISIONS D-011, D-073).
  let comparisonConfidence = scan.comparisonConfidence;
  if (scan.scanNumber > 1 && comparisonConfidence === "high") {
    if (!first?.result || first.source !== scan.source || first.result.engine !== result.engine) comparisonConfidence = "lower";
  }
  const now = await sandboxNow();
  const done = await store.updateScan(scan.id, {
    status: "complete",
    result,
    completedAt: now.toISOString(),
    comparisonConfidence,
    ...(raw !== analysed ? { youcamRaw: raw } : {}),
  });
  await store.getOrCreateReport(scan.clientId, now);
  // We hold the scores and masks now, so YouCam no longer needs this person's photo.
  if (scan.source === "live") await releaseTask(scan);
  // The client becomes a lead at the report gate, once they leave contact details (see unlockReport).
  return done;
}

/** Checks on the skin type this long at most while finalising; it runs beside the analysis, so it's usually done. */
const FITZPATRICK_CHECKS = 4;
const FITZPATRICK_WAIT_MS = 1500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads the Fitzpatrick estimate started beside a live analysis and keeps it on the client (D-094). Never fails or
 * holds up a scan for long: no reading just means Dana sets it herself. The clinic's own call is never overwritten.
 */
async function settleFitzpatrick(scan: Scan): Promise<void> {
  const taskId = scan.fitzpatrickTaskId;
  if (!taskId) return;
  const store = getStore();
  try {
    let task: FitzpatrickTask = { status: "running" };
    for (let i = 0; i < FITZPATRICK_CHECKS && task.status === "running"; i++) {
      if (i > 0) await sleep(FITZPATRICK_WAIT_MS);
      try {
        task = await getFitzpatrickTask(taskId);
      } catch (error) {
        if (!(error instanceof YouCamError && error.transient)) throw error;
      }
    }
    if (task.status !== "success") {
      console.warn(`[youcam] scan ${scan.id}: no skin type (${task.status === "error" ? task.code : "still running"})`);
      return;
    }
    const at = new Date().toISOString();
    await store.logUsage({ provider: "youcam", feature: "fitzpatrick", units: FITZPATRICK_UNITS, taskId, sandboxId: scan.sandboxId, ipHash: null, createdAt: at });
    const client = await store.getClient(scan.clientId);
    if (client && client.fitzpatrick?.source !== "practitioner") {
      await store.updateClient(client.id, { fitzpatrick: { type: task.type, source: "scan", at, scanId: scan.id } });
    }
  } catch (error) {
    console.warn(`[youcam] scan ${scan.id}: skin type not read (${describe(error)})`);
  } finally {
    try {
      await deleteTask(taskId);
    } catch {
      // Removed with the account's 24-hour expiry anyway.
    }
  }
}

export interface ScanView {
  status: Scan["status"];
  stage: string;
  stageIndex: number;
  reportPath?: string;
  /** Demo only: the judge's own scan in the clinic's dashboard (D-090). */
  clinicSidePath?: string | null;
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
    return { status: scan.status, stage: "Ready", stageIndex: STAGES.length, reportPath: `/r/${report.token}`, clinicSidePath: clinicSideLink("", client), demo };
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
