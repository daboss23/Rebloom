// Reads YouCam's skin analysis `output` list (format: "json") into our raw result.
// Pure, so it's tested directly against the recorded response shape.
//
// Each entry has a `type`:
//   a concern ("texture", ...)  ui_score (int), raw_score (float), mask_urls
//   "skin_type"                 three entries, region "whole" | "t_zone" | "u_zone", skin_type "Oily"
//   "all"                       score (float, ui scale)
//   "skin_age"                  score
//   "resize_image"              the image YouCam analysed; ignored (masks match our upload's size)
//
// HD results (DECISIONS D-046) use the same entries with "hd_" in front ("hd_texture", "hd_dark_circle").
// HD wrinkles and pores are also scored by facial area. The HD shape hasn't been recorded live yet, so
// every plausible form of an area is read: an entry with an `area` (or `region`), a nested object per
// area, or a type with the area at the end ("hd_wrinkle_forehead"). The "whole" area is the concern's score.

import { fromHdAction, isConcernKey, type ConcernKey } from "@/lib/skin/concerns";
import type { RawConcernScore, RawSkinResult } from "./types";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const WHOLE = new Set(["whole", "all", "full", "face", "overall"]);

function urlsOf(e: Record<string, unknown>): string[] {
  const list = Array.isArray(e.mask_urls) ? e.mask_urls : [];
  const single = [e.mask_url, e.url].filter((u) => typeof u === "string");
  return [...list, ...single].filter((u): u is string => typeof u === "string" && u !== "");
}

function scoresOf(e: Record<string, unknown>): { ui_score: number; raw_score: number } | null {
  const ui = num(e.ui_score);
  const raw = num(e.raw_score);
  return ui === null || raw === null ? null : { ui_score: ui, raw_score: raw };
}

/** "wrinkle_forehead" to ["wrinkle", "forehead"] when the front is a concern we measure. */
function splitArea(type: string): [ConcernKey, string] | null {
  for (const key of ["wrinkle", "pore"] as const) {
    if (type.startsWith(`${key}_`)) return [key, type.slice(key.length + 1)];
  }
  return null;
}

export function parseSkinOutput(output: readonly unknown[]): RawSkinResult {
  const result: RawSkinResult = { concerns: {} };
  const zones: Record<string, string> = {};
  let hd = false;

  const add = (key: ConcernKey, area: string | null, scores: { ui_score: number; raw_score: number } | null, urls: string[]) => {
    const c: RawConcernScore = result.concerns[key] ?? { ui_score: NaN, raw_score: NaN, mask_urls: [] };
    c.mask_urls = [...(c.mask_urls ?? []), ...urls];
    if (scores && (area === null || WHOLE.has(area))) {
      c.ui_score = scores.ui_score;
      c.raw_score = scores.raw_score;
    } else if (scores && area) {
      c.areas = { ...c.areas, [area]: scores };
    }
    result.concerns[key] = c;
  };

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const rawType = typeof e.type === "string" ? e.type : "";
    if (rawType.startsWith("hd_")) hd = true;
    const type = fromHdAction(rawType);
    const area = typeof e.area === "string" ? e.area : null;

    if (isConcernKey(type)) {
      // A concern scored by area may arrive as one entry with an object per area.
      const nested = Object.entries(e).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v) && scoresOf(v as Record<string, unknown>));
      add(type, area ?? (typeof e.region === "string" ? e.region : null), scoresOf(e), urlsOf(e));
      for (const [name, v] of nested) add(type, name, scoresOf(v as Record<string, unknown>), urlsOf(v as Record<string, unknown>));
    } else if (splitArea(type)) {
      const [key, name] = splitArea(type)!;
      add(key, name, scoresOf(e), urlsOf(e));
    } else if (type === "all") {
      result.all = num(e.score) ?? undefined;
    } else if (type === "skin_age") {
      result.skin_age = num(e.score) ?? undefined;
    } else if (type === "skin_type" && typeof e.skin_type === "string") {
      zones[typeof e.region === "string" ? e.region : "whole"] = e.skin_type.toLowerCase();
    }
  }

  for (const [key, c] of Object.entries(result.concerns) as [ConcernKey, RawConcernScore][]) {
    if (Number.isNaN(c.ui_score)) {
      // No whole-face score: the mean of the areas stands in, so the concern still counts.
      const areas = Object.values(c.areas ?? {});
      if (areas.length === 0) {
        delete result.concerns[key];
        continue;
      }
      c.ui_score = areas.reduce((n, a) => n + a.ui_score, 0) / areas.length;
      c.raw_score = areas.reduce((n, a) => n + a.raw_score, 0) / areas.length;
    }
  }
  if (Object.keys(zones).length > 0) {
    result.skin_type = zones.whole ?? Object.values(zones)[0];
    result.skin_type_zones = zones;
  }
  if (hd) result.engine = "hd";
  else if (Object.keys(result.concerns).length > 0) result.engine = "sd";
  return result;
}

/** The raw result as we store it: no signed links to a person's face data. */
export function withoutMaskUrls(raw: RawSkinResult): RawSkinResult {
  const concerns: RawSkinResult["concerns"] = {};
  for (const [key, c] of Object.entries(raw.concerns)) {
    concerns[key as keyof typeof concerns] = { ui_score: c.ui_score, raw_score: c.raw_score, ...(c.areas ? { areas: c.areas } : {}) };
  }
  return { ...raw, concerns };
}
