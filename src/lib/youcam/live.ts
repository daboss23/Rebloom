import "server-only";
// Live YouCam skin analysis: upload, start a task, poll it, delete it once copied.
// HD whenever the photo is big enough, SD otherwise (DECISIONS D-046).

import sharp from "sharp";
import { env } from "@/lib/env";
import { hdAction } from "@/lib/skin/concerns";
import { createFitzpatrickTask, createSkinAnalysisTask, deleteTask, getSkinAnalysisTask, uploadImage, YouCamError, type SkinTask } from "./client";
import { parseSkinOutput } from "./parse";
import type { SkinAnalysisProvider } from "./types";
import { unitCost, type SkinEngine } from "./units";

/** YouCam's HD model needs at least this many pixels on the photo's short side. Smaller photos are never upscaled. */
export const HD_MIN_SHORT_SIDE = 1080;

/** HD for photos with enough detail, unless HD is switched off. */
export function chooseEngine(width: number, height: number, setting: SkinEngine = env.YOUCAM_ENGINE): SkinEngine {
  return setting === "hd" && Math.min(width, height) >= HD_MIN_SHORT_SIDE ? "hd" : "sd";
}

export function skinActions(engine: SkinEngine, concerns: readonly string[]): string[] {
  const sd = [...concerns, "skin_type"];
  return engine === "hd" ? sd.map((k) => hdAction(k as Parameters<typeof hdAction>[0])) : sd;
}

export const liveProvider: SkinAnalysisProvider = {
  mode: "live",

  async start({ scanId, image, concerns, fitzpatrick }) {
    // An unreadable size means SD: HD is only for photos known to have the detail.
    const { width = 0, height = 0 } = await sharp(image.bytes).metadata().catch(() => ({ width: 0, height: 0 }));
    let engine = chooseEngine(width, height);
    const fileId = await uploadImage(image.bytes, image.contentType, `${scanId}.jpg`);
    let actions = skinActions(engine, concerns);
    let taskId: string;
    try {
      taskId = await createSkinAnalysisTask(fileId, actions);
    } catch (error) {
      // YouCam refused the HD request itself (a parameter or photo it won't take in HD). SD still gives a real reading.
      if (!(engine === "hd" && error instanceof YouCamError && error.kind === "bad_request")) throw error;
      console.warn(`[youcam] scan ${scanId}: HD refused, running SD instead (${error.message})`);
      engine = "sd";
      actions = skinActions(engine, concerns);
      taskId = await createSkinAnalysisTask(fileId, actions);
    }
    // The skin type rides on the same upload. It's a prompt for the practitioner, so it never holds up or fails a scan.
    let fitzpatrickTaskId: string | null = null;
    if (fitzpatrick) {
      try {
        fitzpatrickTaskId = await createFitzpatrickTask(fileId);
      } catch (error) {
        console.warn(`[youcam] scan ${scanId}: skin type not started (${(error as Error).message})`);
      }
    }
    return { taskId, units: unitCost(engine, actions.length), engine, ...(fitzpatrickTaskId ? { fitzpatrickTaskId } : {}) };
  },

  async poll({ taskId, scanId }) {
    let task: SkinTask;
    try {
      task = await getSkinAnalysisTask(taskId);
    } catch (error) {
      if (!(error instanceof YouCamError)) throw error;
      // A blip (rate limit, 5xx, network) isn't a verdict on the photo: the next poll asks again.
      if (error.transient) {
        console.warn(`[youcam] scan ${scanId}: status check will retry (${error.message})`);
        return { status: "running" };
      }
      console.error(`[youcam] scan ${scanId}: status check failed (${error.message})`);
      return { status: "error", code: error.kind === "bad_request" || error.kind === "not_found" ? "task_lost" : `youcam_${error.kind}` };
    }
    if (task.status === "running") return task;
    if (task.status === "error") {
      console.warn(`[youcam] scan ${scanId}: task error ${task.code}${task.message ? ` (${task.message})` : ""}`);
      return { status: "error", code: task.code };
    }
    const raw = parseSkinOutput(task.output);
    if (Object.keys(raw.concerns).length === 0) {
      console.error(`[youcam] scan ${scanId}: task succeeded with no readable scores`);
      return { status: "error", code: "empty_result" };
    }
    return { status: "success", raw };
  },

  release: deleteTask,
};
