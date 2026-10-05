import type { ConcernKey } from "@/lib/skin/concerns";

/**
 * The raw result shape we store in scans.youcam_raw.
 * PROVISIONAL (DECISIONS D-021): follows the brief's description until the official docs are confirmed.
 */
export interface RawConcernScore {
  ui_score: number;
  raw_score: number;
  mask_url?: string;
}

export interface RawSkinResult {
  all?: { ui_score: number; raw_score: number };
  skin_age?: number;
  skin_type?: string;
  concerns: Partial<Record<ConcernKey, RawConcernScore>>;
}

export type PollOutcome =
  | { status: "running" }
  | { status: "success"; raw: RawSkinResult }
  | { status: "error"; code: string };

export interface StartInput {
  scanId: string;
  imagePath: string;
  concerns: readonly ConcernKey[];
}

export interface SkinAnalysisProvider {
  readonly mode: "live" | "fixture";
  start(input: StartInput): Promise<{ taskId: string; units: number }>;
  poll(task: { taskId: string; scanId: string; startedAt: Date }): Promise<PollOutcome>;
}
