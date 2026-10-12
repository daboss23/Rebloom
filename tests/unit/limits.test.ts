import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-limits-"));
process.env.REBLOOM_STORE = "local";
process.env.YOUCAM_MODE = "live";
process.env.YOUCAM_API_KEY = "test-key";

type Limits = typeof import("@/lib/limits");
type Store = typeof import("@/lib/store/local").localStore;
let limits: Limits;
let store: Store;

beforeAll(async () => {
  limits = await import("@/lib/limits");
  store = (await import("@/lib/store/local")).localStore;
});

const log = (feature: string, sandboxId: string, units = 16) =>
  store.logUsage({ provider: "youcam", feature, units, taskId: null, sandboxId, ipHash: null, createdAt: new Date().toISOString() });

describe("live scan limits (D-022, D-094)", () => {
  it("count scans, not a scan's simulation or skin type", async () => {
    for (let i = 0; i < limits.LIMITS.perBrowserPerDay - 1; i++) {
      await log("skin_analysis_hd", "sb-a");
      await log("skin_simulation", "sb-a", 4);
      await log("fitzpatrick", "sb-a", 10);
    }
    expect(await limits.chooseAnalysisMode({ sandboxId: "sb-a", ipHash: null })).toEqual({ mode: "live", reason: null });
    await log("skin_analysis_sd", "sb-a");
    expect(await limits.chooseAnalysisMode({ sandboxId: "sb-a", ipHash: null })).toEqual({ mode: "fixture", reason: "browser_limit" });
  });

  it("still count every unit against the reserve", async () => {
    const before = await limits.unitsRemaining();
    await log("fitzpatrick", "sb-b", 10);
    expect(await limits.unitsRemaining()).toBe(before - 10);
  });
});
