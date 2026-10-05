import "server-only";
// The "what to expect" simulation (DECISIONS D-047). Started by the report's first poll, so it only ever runs
// for clients who opted in at the gate. One provider check per request, like scans (D-019). The result is
// copied into our private storage and the task deleted at YouCam.

import sharp from "sharp";
import type { Report, Scan } from "@/lib/domain";
import { features } from "@/lib/env";
import { LIMITS, unitsRemaining } from "@/lib/limits";
import type { Plan } from "@/lib/plan/build";
import { getStorage, getStore } from "@/lib/store";
import { simulationPath } from "@/lib/store/scan-paths";
import {
  createSkinSimulationTask,
  deleteTask,
  downloadResultImage,
  getSkinSimulationTask,
  uploadImage,
  YouCamError,
} from "@/lib/youcam/client";
import { simulationUnitCost } from "@/lib/youcam/units";
import { simulationIntensities } from "./intensity";

/** A simulation still unfinished after this is abandoned. YouCam says "seconds". */
const SIMULATION_TIMEOUT_MS = 3 * 60_000;
/** A start that never recorded its task (the server stopped mid-way) is given up after this. */
const START_STALE_MS = 60_000;

export type SimulationState =
  | { status: "starting"; at: string }
  | { status: "running"; taskId: string; startedAt: string; intensities: Record<string, number>; units: number }
  | { status: "ready"; at: string }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; code: string };

/** What the report page needs: keep waiting, show the image, or leave the section out. */
export type SimulationView = { status: "pending" } | { status: "ready" } | { status: "none" };

interface ReportContent {
  simulations?: Record<string, SimulationState>;
}

const contentOf = (report: Report): ReportContent =>
  report.content && typeof report.content === "object" ? (report.content as ReportContent) : {};

export function simulationState(report: Report, scanId: string): SimulationState | null {
  return contentOf(report).simulations?.[scanId] ?? null;
}

export function viewOf(state: SimulationState | null): SimulationView {
  if (!state) return { status: "pending" };
  if (state.status === "ready") return { status: "ready" };
  if (state.status === "starting" || state.status === "running") return { status: "pending" };
  return { status: "none" };
}

/**
 * Writes this scan's state, keeping other scans' states. With `claim`, succeeds only if nobody has
 * written this scan's state since `seen` (null: never written), and returns null when another request won.
 */
async function write(
  report: Report,
  scanId: string,
  state: SimulationState,
  claim?: { seen: SimulationState | null },
): Promise<SimulationState | null> {
  const store = getStore();
  for (let attempt = 0; attempt < 5; attempt++) {
    const fresh = (await store.getReportByToken(report.token)) ?? report;
    const current = simulationState(fresh, scanId);
    if (claim && JSON.stringify(current) !== JSON.stringify(claim.seen)) return null;
    const content = contentOf(fresh);
    const next = { ...content, simulations: { ...content.simulations, [scanId]: state } };
    if (await store.updateReportContent(fresh.id, next, fresh.updatedAt)) return state;
    // Someone else wrote in between (perhaps for another scan). Read again and retry.
  }
  throw new Error("report content kept changing; giving up this step");
}

const save = async (report: Report, scanId: string, state: SimulationState) => (await write(report, scanId, state))!;

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function release(taskId: string, scanId: string) {
  try {
    await deleteTask(taskId);
  } catch (error) {
    console.warn(`[simulation] scan ${scanId}: couldn't delete the task at YouCam (${describe(error)})`);
  }
}

async function start(report: Report, scan: Scan, plan: Plan): Promise<SimulationState> {
  // Live scans only: a demo reading must never produce a picture that looks like a real prediction.
  if (scan.source !== "live" || !features.youcamLive) return save(report, scan.id, { status: "unavailable", reason: "not_live" });
  const intensities = simulationIntensities(plan);
  const count = Object.keys(intensities).length;
  if (count === 0) return save(report, scan.id, { status: "unavailable", reason: "nothing_to_show" });
  const units = simulationUnitCost(count);
  if ((await unitsRemaining()) - units < LIMITS.reserveUnits) return save(report, scan.id, { status: "unavailable", reason: "reserve" });

  // Claimed before the slow part. Only one request wins, so a second poll (another tab, a double effect)
  // can never start a second task or spend units twice.
  const claimed = await write(report, scan.id, { status: "starting", at: new Date().toISOString() }, { seen: null });
  if (!claimed) return { status: "starting", at: new Date().toISOString() };
  try {
    const image = await getStorage().get(scan.imagePath);
    if (!image) return save(report, scan.id, { status: "failed", code: "photo_missing" });
    const fileId = await uploadImage(image.bytes, image.contentType, `${scan.id}-simulation.jpg`);
    const taskId = await createSkinSimulationTask(fileId, intensities);
    await getStore().logUsage({
      provider: "youcam",
      feature: "skin_simulation",
      units,
      taskId,
      sandboxId: scan.sandboxId,
      ipHash: null,
      createdAt: new Date().toISOString(),
    });
    return save(report, scan.id, { status: "running", taskId, startedAt: new Date().toISOString(), intensities, units });
  } catch (error) {
    const kind = error instanceof YouCamError ? error.kind : "unexpected";
    console.error(`[simulation] scan ${scan.id}: couldn't start (${describe(error)})`);
    return save(report, scan.id, { status: "failed", code: `start_${kind}` });
  }
}

/** Moves the simulation forward by at most one step, and says what the page should show. */
export async function advanceSimulation(report: Report, scan: Scan, plan: Plan): Promise<SimulationView> {
  let state = simulationState(report, scan.id);
  if (!state) state = await start(report, scan, plan);
  else if (state.status === "starting" && Date.now() - Date.parse(state.at) > START_STALE_MS) {
    state = await save(report, scan.id, { status: "failed", code: "start_interrupted" });
  } else if (state.status === "running") {
    state = await poll(report, scan, state);
  }
  return viewOf(state);
}

async function poll(report: Report, scan: Scan, state: Extract<SimulationState, { status: "running" }>): Promise<SimulationState> {
  const store = getStore();
  // Only the request that moves the task on from "running" settles it. A slower one keeps what the winner wrote.
  const settle = async (next: SimulationState) =>
    (await write(report, scan.id, next, { seen: state })) ??
    simulationState((await store.getReportByToken(report.token)) ?? report, scan.id) ??
    next;
  const fail = async (code: string, charged: boolean) => {
    const won = await write(report, scan.id, { status: "failed", code }, { seen: state });
    if (!won) return settle({ status: "failed", code });
    // YouCam charges only for finished tasks. A timed-out one may still finish, so its units stay counted.
    if (!charged) await store.settleUsage({ provider: "youcam", taskId: state.taskId }, 0);
    await release(state.taskId, scan.id);
    return won;
  };
  if (Date.now() - Date.parse(state.startedAt) > SIMULATION_TIMEOUT_MS) return fail("timeout", true);

  let task;
  try {
    task = await getSkinSimulationTask(state.taskId);
  } catch (error) {
    if (error instanceof YouCamError && error.transient) return state;
    console.error(`[simulation] scan ${scan.id}: status check failed (${describe(error)})`);
    return fail(error instanceof YouCamError ? `youcam_${error.kind}` : "unexpected", false);
  }
  if (task.status === "running") return state;
  if (task.status === "error") {
    console.warn(`[simulation] scan ${scan.id}: task error ${task.code}${task.message ? ` (${task.message})` : ""}`);
    return fail(task.code, false);
  }

  try {
    const bytes = await downloadResultImage(task.imageUrl);
    // Re-encoded at the photo's own size, so the two sit side by side exactly, with no metadata carried over.
    const jpeg = await sharp(bytes)
      .resize(scan.imageWidth, scan.imageHeight, { fit: "cover" })
      .jpeg({ quality: 88 })
      .toBuffer();
    await getStorage().put(simulationPath(scan.imagePath), jpeg, "image/jpeg");
  } catch (error) {
    console.error(`[simulation] scan ${scan.id}: result not copied (${describe(error)})`);
    // The task succeeded, so the units were spent; only the copy failed.
    const next = await settle({ status: "failed", code: "copy_failed" });
    if (next.status === "failed") await release(state.taskId, scan.id);
    return next;
  }
  const next = await settle({ status: "ready", at: new Date().toISOString() });
  await release(state.taskId, scan.id);
  return next;
}
