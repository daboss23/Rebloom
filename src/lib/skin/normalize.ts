import type { ScanResult } from "@/lib/domain";
import type { RawSkinResult } from "@/lib/youcam/types";
import { SCORED_CONCERNS } from "./concerns";

const score = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Turns a provider result into our normalised format. Raw API names stay internal. */
export function normalizeResult(raw: RawSkinResult): ScanResult {
  return {
    concerns: SCORED_CONCERNS.flatMap((key) => {
      const c = raw.concerns[key];
      return c ? [{ key, ui: score(c.ui_score), raw: score(c.raw_score), maskPath: null }] : [];
    }),
    overall: raw.all ? { ui: score(raw.all.ui_score), raw: score(raw.all.raw_score) } : null,
    skinAge: typeof raw.skin_age === "number" ? Math.round(raw.skin_age) : null,
    skinType: raw.skin_type ?? null,
  };
}

/** Lowest ui scores first: these are the priorities. */
export function priorities(result: ScanResult, count = 3) {
  return [...result.concerns].sort((a, b) => a.ui - b.ui).slice(0, count);
}
