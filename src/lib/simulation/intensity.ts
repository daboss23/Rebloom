// Which concerns a simulation shows, and how strongly (DECISIONS D-047). Pure, so it's tested directly.
// Only concerns the client's plan works on are simulated: the picture illustrates the plan, nothing more.

import type { Plan } from "@/lib/plan/build";
import type { ConcernKey } from "@/lib/skin/concerns";

/** YouCam's simulation names for the concerns it can show (10 of our 15). */
export const SIMULATION_NAMES: Partial<Record<ConcernKey, string>> = {
  radiance: "radiance",
  acne: "acne",
  oiliness: "oiliness",
  eye_bag: "eye_bag",
  dark_circle_v2: "dark_circle",
  age_spot: "spot",
  pore: "pore",
  texture: "texture",
  wrinkle: "wrinkle",
  redness: "redness",
};

/**
 * The strongest setting we ever ask for. YouCam's scale runs from 0 (as you are) to 1 ("full correction").
 * 0.5 sits in its "balanced" band: visible, but within what a course can honestly suggest.
 */
export const MAX_INTENSITY = 0.5;
/** Below this, YouCam's change is too slight to see side by side. */
export const MIN_INTENSITY = 0.2;

/** Intensity per concern, in YouCam's names: a full course gets MAX_INTENSITY, fewer sessions proportionally less. */
export function simulationIntensities(plan: Plan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of plan.recommended.lines) {
    const share = Math.min(1, line.sessions / line.course);
    const intensity = Math.round(Math.max(MIN_INTENSITY, MAX_INTENSITY * share) * 10) / 10;
    for (const key of line.covers) {
      const name = SIMULATION_NAMES[key];
      if (name) out[name] = Math.max(out[name] ?? 0, intensity);
    }
  }
  return out;
}

/** The week the illustration stands for: the planned progress scan (or the last session), counted from the scan. */
export function illustratedWeek(plan: Plan, from: string): number | null {
  const step = plan.timeline.find((s) => s.kind === "progress") ?? [...plan.timeline].reverse().find((s) => s.kind === "session");
  if (!step) return null;
  const days = (Date.parse(`${step.date}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
  return Math.max(1, Math.round(days / 7));
}
