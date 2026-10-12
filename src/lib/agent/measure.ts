// Part 2 of the agent (DECISIONS D-093): before anyone calls a client stalled, can their last scans be compared at
// all? Code decides this, never the model: the same checks the progress view makes (D-011, D-073), across each pair
// of the scans the stall is read from. When any fails, the honest next step is a rescan in matching light, not a
// change of plan. Pure.

import { lightMatch } from "@/lib/capture/gate";
import { LIGHT_MATCH } from "@/lib/capture/thresholds";
import type { PlanSuggestion, Scan } from "@/lib/domain";

/** The stall rule reads the last three scans (src/lib/rebook/engine.ts). */
export const STALL_SCANS = 3;

const label = (s: Scan) => `scan ${String(s.scanNumber).padStart(2, "0")}`;

/** Whether the scans the stall was read from measure the same way, and if not, why, in plain words. */
export function checkMeasurement(scans: Scan[]): PlanSuggestion["measurement"] {
  const done = scans.filter((s) => s.status === "complete" && s.result).sort((a, b) => a.scanNumber - b.scanNumber);
  const recent = done.slice(-STALL_SCANS);
  const reasons: string[] = [];
  if (recent.length < 2) return { trustworthy: false, reasons: ["There aren't two finished scans to compare yet."] };

  for (const scan of recent) {
    if (scan.scanNumber > 1 && scan.comparisonConfidence === "lower") {
      reasons.push(`${label(scan)} was read on a different scale from the first scan, so its scores can't be compared.`);
    }
    // A demo scan records no capture metrics; its authored comparison stands in for the gate, as on the report.
    if (!scan.captureQuality) {
      if (scan.source === "live") reasons.push(`${label(scan)} has no record of how the photo was taken.`);
    } else if (!scan.captureQuality.passedGate) {
      reasons.push(
        scan.captureQuality.method === "upload"
          ? `${label(scan)} was an uploaded photo, so the light and angle weren't checked.`
          : `${label(scan)} was taken before every photo check had passed.`,
      );
    }
  }
  for (let i = 1; i < recent.length; i++) {
    const [a, b] = [recent[i - 1], recent[i]];
    if (a.source !== b.source || (a.result!.engine ?? "sd") !== (b.result!.engine ?? "sd")) {
      reasons.push(`${label(a)} and ${label(b)} were read by different analysis engines.`);
    }
    if (a.captureQuality && b.captureQuality) {
      if (!lightMatch(a.captureQuality, b.captureQuality).matches) {
        // The same order lightMatch checks in: brightness first, then warmth.
        const dl = b.captureQuality.luminance - a.captureQuality.luminance;
        const light = Math.abs(dl) > LIGHT_MATCH.maxLuminanceDelta ? (dl > 0 ? "brighter" : "dimmer") : b.captureQuality.warmth > a.captureQuality.warmth ? "warmer" : "cooler";
        reasons.push(`${label(b)} was taken in ${light} light than ${label(a)}.`);
      }
    }
  }
  return { trustworthy: reasons.length === 0, reasons: [...new Set(reasons)] };
}
