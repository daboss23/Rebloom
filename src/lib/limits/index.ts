import "server-only";
// Safety valves for live YouCam spend (DECISIONS D-022). Hitting one never shows an error:
// that scan simply runs in fixture mode and is labelled "Demo analysis".
import { env, features } from "@/lib/env";
import { getStore } from "@/lib/store";
import { unitCost } from "@/lib/youcam/units";
import { SCORED_CONCERNS } from "@/lib/skin/concerns";

export const LIMITS = {
  perBrowserPerDay: 5,
  perIpPerDay: 5,
  globalPerDay: 60,
  /** Units always kept back for Joshua's own demo and video takes. */
  reserveUnits: 64,
} as const;

/** Why a scan ran in fixture mode. `live_unavailable`: YouCam refused or failed to start the task. */
export type ModeReason = "fixture_mode" | "browser_limit" | "daily_cap" | "reserve" | "live_unavailable" | null;

const DAY_MS = 86_400_000;

export async function chooseAnalysisMode(input: {
  sandboxId: string | null;
  ipHash: string | null;
}): Promise<{ mode: "live" | "fixture"; reason: ModeReason }> {
  if (!features.youcamLive) return { mode: "fixture", reason: "fixture_mode" };
  const store = getStore();
  const since = new Date(Date.now() - DAY_MS); // real time on purpose: limits are about real spend
  const [mine, fromIp, today, ever] = await Promise.all([
    input.sandboxId ? store.sumUsage({ provider: "youcam", since, sandboxId: input.sandboxId }) : null,
    input.ipHash ? store.sumUsage({ provider: "youcam", since, ipHash: input.ipHash }) : null,
    store.sumUsage({ provider: "youcam", since }),
    store.sumUsage({ provider: "youcam", since: new Date(0) }),
  ]);
  if ((mine?.count ?? 0) >= LIMITS.perBrowserPerDay || (fromIp?.count ?? 0) >= LIMITS.perIpPerDay) {
    return { mode: "fixture", reason: "browser_limit" };
  }
  if (today.count >= LIMITS.globalPerDay) return { mode: "fixture", reason: "daily_cap" };
  // Budgeted at the HD price: the engine is only known once the photo is read.
  const nextCost = unitCost(env.YOUCAM_ENGINE, SCORED_CONCERNS.length + 1);
  if (env.YOUCAM_UNIT_BUDGET - ever.units - nextCost < LIMITS.reserveUnits) return { mode: "fixture", reason: "reserve" };
  return { mode: "live", reason: null };
}

export async function unitsRemaining(): Promise<number> {
  const ever = await getStore().sumUsage({ provider: "youcam", since: new Date(0) });
  return env.YOUCAM_UNIT_BUDGET - ever.units;
}
