// The progress view's numbers and words (brief 3.1 step 10, DECISIONS D-009 to D-011, D-073).
// Clients see ui scores, and the arithmetic matches what's on screen. Whether a change is real is decided on raw
// scores: a badge needs a raw rise that clears the progress bar and a comparison taken in the same light.

import type { Scan } from "@/lib/domain";
import { PROGRESS_MOMENT_RAW_DELTA, STALLED_RAW_DELTA } from "@/lib/rebook/thresholds";
import { CONCERNS, type ConcernKey } from "@/lib/skin/concerns";

export type Verdict = "improved" | "improving" | "steady" | "lower" | "unconfirmed";

export interface ConcernProgress {
  key: ConcernKey;
  label: string;
  /** ui scores, first scan and latest. */
  from: number;
  to: number;
  uiDelta: number;
  rawDelta: number;
  verdict: Verdict;
  /** "+13", only for a change the raw scores confirm. */
  badge: string | null;
  /** ui scores across every scan, oldest first. */
  series: number[];
  line: string;
}

export interface Progress {
  first: Scan;
  latest: Scan;
  /** Whole weeks between the first scan and the latest. */
  weeks: number;
  /** Both scans passed the capture gate and the light matched: "Same light, same angle." */
  verified: boolean;
  /** The comparison counts: same light, same source and engine (D-011). */
  confident: boolean;
  items: ConcernProgress[];
  /** At least one priority shows confirmed change. */
  moved: boolean;
}

const DAY_MS = 86_400_000;
const when = (s: Scan) => Date.parse(s.completedAt ?? s.createdAt);
const score = (s: Scan, key: ConcernKey) => s.result?.concerns.find((c) => c.key === key) ?? null;

function verdictOf(uiDelta: number, rawDelta: number, confident: boolean): Verdict {
  if (!confident) return "unconfirmed";
  // The shown and the measured disagree: say neither (D-010).
  if ((uiDelta > 0 && rawDelta < 0) || (uiDelta < 0 && rawDelta > 0)) return "steady";
  if (uiDelta > 0 && rawDelta >= PROGRESS_MOMENT_RAW_DELTA) return "improved";
  if (uiDelta > 0 && rawDelta >= STALLED_RAW_DELTA) return "improving";
  if (uiDelta < 0 && rawDelta <= -PROGRESS_MOMENT_RAW_DELTA) return "lower";
  return "steady";
}

const points = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;

/** Each line states this priority's own movement; the general reassurance is said once, not three times. */
function lineFor(i: ConcernProgress, best: ConcernProgress | undefined, firstOfKind: boolean): string {
  const moved = Math.abs(i.uiDelta);
  switch (i.verdict) {
    case "improved":
      return i === best
        ? `Your biggest change. ${i.label} ${/[^s]s$/i.test(i.label) ? "have" : "has"} moved ${points(i.uiDelta)} since your first scan, measured in the same light.`
        : `Real, measured change: ${points(i.uiDelta)} since your first scan.`;
    case "improving":
      return `Up ${points(i.uiDelta)} and moving the right way.${firstOfKind ? " Change here often builds over the next few sessions." : ""}`;
    case "steady": {
      // Named, so two unchanged priorities never read as the same sentence. "Pores are", "Redness is".
      const verb = /[^s]s$/i.test(i.label) ? "are" : "is";
      const where = moved === 0 ? `${i.label} ${verb} the same as at your first scan.` : `${i.label} ${verb} within ${points(moved)} of your first scan.`;
      return `${where}${firstOfKind ? " Some concerns take longer than others to show visible change." : ""}`;
    }
    case "lower":
      return `${points(moved)} lower than at your first scan.${
        firstOfKind ? " Skin shifts with season, sleep and stress, and your practitioner will look at this with you." : ""
      }`.replace(/^./, (c) => c.toUpperCase());
    case "unconfirmed":
      return firstOfKind
        ? "The light was different from your first scan, so we'll confirm this change on your next one."
        : `${i.uiDelta >= 0 ? "Up" : "Down"} ${points(moved)} on screen, to be confirmed on your next scan.`;
  }
}

/**
 * Compares a client's latest scan with their first, on the priorities chosen from the first scan. Null with fewer
 * than two scans: the report is still the first report.
 */
export function buildProgress(scans: Scan[], keys: ConcernKey[]): Progress | null {
  const done = scans.filter((s) => s.status === "complete" && s.result).sort((a, b) => a.scanNumber - b.scanNumber);
  if (done.length < 2) return null;
  const first = done[0];
  const latest = done[done.length - 1];
  const confident = latest.comparisonConfidence !== "lower";
  // A demo scan records no capture metrics; its authored comparison stands in for the gate.
  const passed = (s: Scan) => (s.captureQuality ? s.captureQuality.passedGate : s.source === "fixture");
  const verified = confident && passed(first) && passed(latest);

  const items: ConcernProgress[] = [];
  for (const key of keys) {
    const [a, b] = [score(first, key), score(latest, key)];
    if (!a || !b) continue;
    const uiDelta = b.ui - a.ui;
    const rawDelta = b.raw - a.raw;
    const verdict = verdictOf(uiDelta, rawDelta, confident);
    items.push({
      key,
      label: CONCERNS[key].label,
      from: a.ui,
      to: b.ui,
      uiDelta,
      rawDelta,
      verdict,
      badge: verdict === "improved" ? `+${uiDelta}` : null,
      series: done.map((s) => score(s, key)?.ui).filter((v): v is number => v !== undefined),
      line: "",
    });
  }

  // The largest confirmed change is the headline; the others are described plainly.
  const best = items.filter((i) => i.verdict === "improved").sort((x, y) => y.rawDelta - x.rawDelta)[0];
  const seen = new Set<Verdict>();
  for (const i of items) {
    i.line = lineFor(i, best, !seen.has(i.verdict));
    seen.add(i.verdict);
  }

  return {
    first,
    latest,
    weeks: Math.max(0, Math.round((when(latest) - when(first)) / (7 * DAY_MS))),
    verified,
    confident,
    items,
    moved: Boolean(best),
  };
}

/** "12 weeks in." and the rest of the subhead. */
export function progressSubhead(p: Progress): string {
  const since = p.moved ? "Here's what's changed since your first scan." : "Here's where things stand since your first scan.";
  if (p.weeks < 1) return since;
  return `${p.weeks === 1 ? "One week" : `${p.weeks} weeks`} in. ${since}`;
}
