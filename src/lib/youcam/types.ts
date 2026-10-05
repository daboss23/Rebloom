import type { ConcernKey } from "@/lib/skin/concerns";
import type { SkinEngine } from "./units";

/**
 * Our raw result: YouCam's numbers, unmodified, keyed by concern. Stored in scans.youcam_raw.
 * Shape confirmed against live-recorded v2.1 responses (DECISIONS D-041).
 */
export interface RawConcernScore {
  /** Integer 1 to 100, adjusted upward by YouCam for display. */
  ui_score: number;
  /** Float 1 to 100, the underlying measurement. Higher is healthier. */
  raw_score: number;
  /** Live only, in memory only: signed mask links, valid about 2 hours. Never stored. */
  mask_urls?: string[];
  /** HD only: scores by facial area for wrinkles (forehead, crow's feet, ...) and pores (nose, cheeks, ...). */
  areas?: Record<string, { ui_score: number; raw_score: number }>;
}

export interface RawSkinResult {
  /** Which YouCam model read the photo. Scores from different engines aren't compared (DECISIONS D-046). */
  engine?: SkinEngine;
  /** YouCam's overall score: one number, on the ui scale. */
  all?: number;
  skin_age?: number;
  /** Lowercase whole-face reading, e.g. "oily". */
  skin_type?: string;
  /** Live only: skin type per zone, e.g. { whole: "oily", t_zone: "oily", u_zone: "normal" }. */
  skin_type_zones?: Record<string, string>;
  concerns: Partial<Record<ConcernKey, RawConcernScore>>;
}

export type PollOutcome =
  | { status: "running" }
  | { status: "success"; raw: RawSkinResult }
  | { status: "error"; code: string };

export interface StartInput {
  scanId: string;
  image: { bytes: Buffer; contentType: string };
  concerns: readonly ConcernKey[];
}

export interface SkinAnalysisProvider {
  readonly mode: "live" | "fixture";
  start(input: StartInput): Promise<{ taskId: string; units: number; engine?: SkinEngine }>;
  poll(task: { taskId: string; scanId: string; startedAt: Date }): Promise<PollOutcome>;
  /** Deletes the photo and results from the provider once we hold our own copy. */
  release?(taskId: string): Promise<void>;
}
