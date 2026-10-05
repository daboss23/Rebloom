import { createHash, timingSafeEqual } from "node:crypto";
import { env, features } from "@/lib/env";
import { LIMITS, unitsRemaining } from "@/lib/limits";
import { json } from "@/lib/scans/access";
import { getCredits, YouCamError } from "@/lib/youcam/client";

/**
 * Is YouCam connected? Reads the account balance, which costs no units.
 * Needs `Authorization: Bearer <CRON_SECRET>`. Without a CRON_SECRET it only answers in local development.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "Not found" }, 404);

  const app = {
    mode: env.YOUCAM_MODE,
    keySet: Boolean(env.YOUCAM_API_KEY),
    liveScans: features.youcamLive,
    budget: { units: env.YOUCAM_UNIT_BUDGET, remainingByOurLog: await unitsRemaining(), reserve: LIMITS.reserveUnits },
  };
  if (!env.YOUCAM_API_KEY) {
    return json({ ...app, connected: false, problem: "YOUCAM_API_KEY is not set, so every scan uses demo analysis." });
  }
  try {
    const unitsInAccount = await getCredits();
    const note = !features.youcamLive ? "The key works. Set YOUCAM_MODE=live to run real scans." : undefined;
    return json({ ...app, connected: true, unitsInAccount, ...(note ? { note } : {}) });
  } catch (error) {
    return json({ ...app, connected: false, problem: explain(error) });
  }
}

function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return env.NODE_ENV === "development";
  const given = request.headers.get("authorization") ?? "";
  // Compare digests so the check takes the same time whatever was sent.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(`Bearer ${env.CRON_SECRET}`));
}

function explain(error: unknown): string {
  if (!(error instanceof YouCamError)) return "Unexpected error while contacting YouCam.";
  switch (error.kind) {
    case "auth":
      return "YouCam rejected the API key. Check YOUCAM_API_KEY in Vercel, then redeploy.";
    case "credits":
      return "The YouCam account is out of units. Scans run as demo analysis until it's topped up.";
    case "network":
      return "Couldn't reach YouCam from the server. Try again in a minute.";
    case "rate_limited":
      return "YouCam is rate limiting this key. Try again in a few minutes.";
    default:
      return `YouCam answered unexpectedly (${error.message}).`;
  }
}
