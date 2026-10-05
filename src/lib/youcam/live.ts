import "server-only";
import type { SkinAnalysisProvider } from "./types";

/**
 * The live YouCam client. Written against the official docs once they're reachable
 * from the build workspace (PLAN.md, "After keys are in"). Until then, live mode is off.
 */
export const liveProvider: SkinAnalysisProvider = {
  mode: "live",
  async start() {
    throw new Error("Live YouCam analysis is not wired up yet.");
  },
  async poll() {
    return { status: "error", code: "live_not_configured" };
  },
};
