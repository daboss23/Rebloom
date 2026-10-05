import type { ScanResult } from "@/lib/domain";
import type { RawSkinResult } from "@/lib/youcam/types";
import { SCORED_CONCERNS } from "./concerns";

const clamp = (n: number) => Math.max(0, Math.min(100, n));
/** ui scores are whole numbers, as clients see them. */
const uiScore = (n: number) => Math.round(clamp(n));
/** raw scores keep one decimal: progress thresholds are a few points wide (DECISIONS D-011). */
const rawScore = (n: number) => Math.round(clamp(n) * 10) / 10;

/** Turns a provider result into our normalised format. Raw API names stay internal. */
export function normalizeResult(raw: RawSkinResult): ScanResult {
  const concerns = SCORED_CONCERNS.flatMap((key) => {
    const c = raw.concerns[key];
    return c ? [{ key, ui: uiScore(c.ui_score), raw: rawScore(c.raw_score), maskPath: null }] : [];
  });
  // YouCam's overall score is one number on the ui scale. The raw overall is ours:
  // the mean of the measured raw scores, so it moves only when the measurements do.
  const overall =
    typeof raw.all === "number" && concerns.length > 0
      ? { ui: uiScore(raw.all), raw: rawScore(concerns.reduce((n, c) => n + c.raw, 0) / concerns.length) }
      : null;
  return {
    concerns,
    overall,
    skinAge: typeof raw.skin_age === "number" ? Math.round(raw.skin_age) : null,
    skinType: raw.skin_type ?? null,
  };
}

/** Lowest ui scores first: these are the priorities. */
export function priorities(result: ScanResult, count = 3) {
  return [...result.concerns].sort((a, b) => a.ui - b.ui).slice(0, count);
}
