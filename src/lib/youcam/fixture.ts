import "server-only";
// Fixture mode (brief 6.3): realistic sample results with zero API calls.
// Scores come from a few hand-written profiles shaped like real results, with small jitter.
// They are labelled "Demo analysis" wherever they appear.

import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import type { ConcernKey } from "@/lib/skin/concerns";
import type { RawSkinResult, SkinAnalysisProvider } from "./types";

type Profile = { skinAge: number; skinType: string; ui: Record<ConcernKey, number> };

/** ui scores. Profile A matches Amelia's scan 01 in the brief and mockup. */
export const FIXTURE_PROFILES: Profile[] = [
  {
    skinAge: 33,
    skinType: "combination",
    ui: {
      texture: 58, age_spot: 61, pore: 66, dark_circle_v2: 68, radiance: 70, moisture: 72, redness: 74, oiliness: 77,
      eye_bag: 80, firmness: 82, wrinkle: 85, tear_trough: 86, acne: 88, droopy_upper_eyelid: 84, droopy_lower_eyelid: 83,
    },
  },
  {
    skinAge: 41,
    skinType: "dry",
    ui: {
      wrinkle: 59, firmness: 63, moisture: 64, droopy_lower_eyelid: 66, tear_trough: 69, age_spot: 71, dark_circle_v2: 72,
      radiance: 70, texture: 75, eye_bag: 74, droopy_upper_eyelid: 73, redness: 81, pore: 79, oiliness: 88, acne: 91,
    },
  },
  {
    skinAge: 26,
    skinType: "oily",
    ui: {
      acne: 56, oiliness: 60, pore: 62, redness: 67, texture: 69, radiance: 74, moisture: 79, age_spot: 82,
      dark_circle_v2: 76, eye_bag: 85, wrinkle: 90, firmness: 89, tear_trough: 88, droopy_upper_eyelid: 91, droopy_lower_eyelid: 90,
    },
  },
  {
    skinAge: 37,
    skinType: "normal",
    ui: {
      redness: 57, age_spot: 63, radiance: 65, texture: 70, moisture: 68, pore: 73, dark_circle_v2: 71, eye_bag: 77,
      wrinkle: 76, firmness: 79, oiliness: 83, acne: 86, tear_trough: 80, droopy_upper_eyelid: 82, droopy_lower_eyelid: 81,
    },
  },
];

/**
 * Provisional ui ↔ raw relationship for fixtures. YouCam adjusts ui scores upward
 * "as a psychological motivator"; the true curve is confirmed from live results.
 */
export function rawFromUi(ui: number): number {
  return Math.max(1, Math.min(100, Math.round((ui - 35) / 0.65)));
}

function seeded(seed: string): () => number {
  let h = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fixtureResult(scanId: string, concerns: readonly ConcernKey[], profileIndex?: number): RawSkinResult {
  const rand = seeded(scanId);
  const profile = FIXTURE_PROFILES[profileIndex ?? Math.floor(rand() * FIXTURE_PROFILES.length)];
  const jitter = profileIndex === undefined ? () => Math.round(rand() * 6 - 3) : () => 0;
  const result: RawSkinResult = { concerns: {}, skin_age: profile.skinAge, skin_type: profile.skinType };
  for (const key of concerns) {
    const ui = Math.max(40, Math.min(98, profile.ui[key] + jitter()));
    result.concerns[key] = { ui_score: ui, raw_score: rawFromUi(ui) };
  }
  const uis = Object.values(result.concerns).map((c) => c!.ui_score);
  const avg = Math.round(uis.reduce((a, b) => a + b, 0) / Math.max(1, uis.length));
  result.all = { ui_score: avg, raw_score: rawFromUi(avg) };
  return result;
}

export const fixtureProvider: SkinAnalysisProvider = {
  mode: "fixture",
  async start({ scanId }) {
    return { taskId: `fixture:${scanId}`, units: 0 };
  },
  async poll({ scanId, startedAt }) {
    if (Date.now() - startedAt.getTime() < env.FIXTURE_DELAY_MS) return { status: "running" };
    // Concerns are decided at finalisation from the scan row; poll returns the full set.
    const { SCORED_CONCERNS } = await import("@/lib/skin/concerns");
    return { status: "success", raw: fixtureResult(scanId, SCORED_CONCERNS) };
  },
};
