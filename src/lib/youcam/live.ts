import "server-only";
// Live YouCam skin analysis (SD): upload, start a task, poll it, delete it once copied.

import { createSkinAnalysisTask, deleteTask, getSkinAnalysisTask, uploadImage, YouCamError, type SkinTask } from "./client";
import { parseSkinOutput } from "./parse";
import type { SkinAnalysisProvider } from "./types";
import { sdUnitCost } from "./units";

export const liveProvider: SkinAnalysisProvider = {
  mode: "live",

  async start({ scanId, image, concerns }) {
    const actions = [...concerns, "skin_type"];
    const fileId = await uploadImage(image.bytes, image.contentType, `${scanId}.jpg`);
    const taskId = await createSkinAnalysisTask(fileId, actions);
    return { taskId, units: sdUnitCost(actions.length) };
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
