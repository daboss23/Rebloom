// Reads YouCam's skin analysis `output` list (format: "json") into our raw result.
// Pure, so it's tested directly against the recorded response shape.
//
// Each entry has a `type`:
//   a concern ("texture", ...)  ui_score (int), raw_score (float), mask_urls
//   "skin_type"                 three entries, region "whole" | "t_zone" | "u_zone", skin_type "Oily"
//   "all"                       score (float, ui scale)
//   "skin_age"                  score
//   "resize_image"              the image YouCam analysed; ignored (masks match our upload's size)

import { isConcernKey } from "@/lib/skin/concerns";
import type { RawSkinResult } from "./types";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseSkinOutput(output: readonly unknown[]): RawSkinResult {
  const result: RawSkinResult = { concerns: {} };
  const zones: Record<string, string> = {};
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const type = typeof e.type === "string" ? e.type : "";
    if (isConcernKey(type)) {
      const ui = num(e.ui_score);
      const raw = num(e.raw_score);
      if (ui === null || raw === null) continue;
      const urls = Array.isArray(e.mask_urls) ? e.mask_urls.filter((u): u is string => typeof u === "string" && u !== "") : [];
      result.concerns[type] = { ui_score: ui, raw_score: raw, mask_urls: urls };
    } else if (type === "all") {
      result.all = num(e.score) ?? undefined;
    } else if (type === "skin_age") {
      result.skin_age = num(e.score) ?? undefined;
    } else if (type === "skin_type" && typeof e.skin_type === "string") {
      zones[typeof e.region === "string" ? e.region : "whole"] = e.skin_type.toLowerCase();
    }
  }
  if (Object.keys(zones).length > 0) {
    result.skin_type = zones.whole ?? Object.values(zones)[0];
    result.skin_type_zones = zones;
  }
  return result;
}

/** The raw result as we store it: no signed links to a person's face data. */
export function withoutMaskUrls(raw: RawSkinResult): RawSkinResult {
  const concerns: RawSkinResult["concerns"] = {};
  for (const [key, c] of Object.entries(raw.concerns)) {
    concerns[key as keyof typeof concerns] = { ui_score: c.ui_score, raw_score: c.raw_score };
  }
  return { ...raw, concerns };
}
