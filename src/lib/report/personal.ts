// Report wording built from this client's own scores, answers and plan (DECISIONS D-045).
// Rules-based, so every line is true of the numbers on the page. The Claude-written report
// (Week 2) replaces these sentences, and these stay as its fallback (brief 8.3).

import type { ConcernScore, ScanResult } from "@/lib/domain";
import { joinLabels, type Plan } from "@/lib/plan/build";
import { CONCERNS, type ConcernKey } from "@/lib/skin/concerns";

/** Scores at or above this read as a strength. */
const STRONG = 85;

const label = (k: ConcernKey) => CONCERNS[k].label;
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The two highest-scoring concerns, named in the subhead so it describes this face, not every face. */
export function subhead(result: ScanResult): string {
  const strengths = [...result.concerns].sort((a, b) => b.ui - a.ui).filter((c) => c.ui >= STRONG).slice(0, 2);
  if (strengths.length === 0) return "Here's what we see, and where we'd begin.";
  return `${sentenceCase(joinLabels(strengths.map((s) => s.key)))} ${strengths.length === 1 ? "is" : "are"} already looking strong. Here's where we'd begin.`;
}

/** Where on the face, for HD's per-area wrinkle and pore scores. Unknown area names are never shown. */
const AREA_PLACES: Record<string, string> = {
  forehead: "across the forehead",
  glabellar: "between the brows",
  crowfeet: "at the crow's feet",
  crows_feet: "at the crow's feet",
  periocular: "around the eyes",
  nasolabial: "in the smile lines",
  marionette: "in the lines from mouth to chin",
  nose: "around the nose",
  cheek: "across the cheeks",
  cheeks: "across the cheeks",
};

/** "Most visible at the crow's feet." from HD area scores: the lowest-scoring area we can name. */
export function mostVisibleArea(concern: ConcernScore): string | null {
  const named = Object.entries(concern.areas ?? {}).filter(([area]) => AREA_PLACES[area]);
  if (named.length < 2) return null;
  const [area] = named.sort((a, b) => a[1] - b[1])[0];
  return `Most visible ${AREA_PLACES[area]}.`;
}

/** The plain-words meaning under each of the three priorities. */
export function priorityMeaning(
  rank: number,
  concern: ConcernScore,
  previous: ConcernScore[],
  stated: Map<ConcernKey, string>,
  plan: Plan,
): string {
  const parts: string[] = [
    rank === 0
      ? "Your biggest opportunity, and the area most likely to show visible change with treatment."
      : CONCERNS[concern.key].describes,
  ];
  const where = mostVisibleArea(concern);
  if (where) parts.push(where);
  const phrase = stated.get(concern.key);
  if (phrase) parts.push(rank === 0 ? `You mentioned ${phrase}, so we're starting in the same place.` : `You mentioned ${phrase} too, and your scan agrees.`);

  const line = plan.recommended.lines.find((l) => l.covers.includes(concern.key));
  if (line) {
    const shared = previous.find((p) => line.covers.includes(p.key));
    parts.push(
      shared
        ? `${line.treatment.name} works on this as well as ${label(shared.key).toLowerCase()}, so one plan covers both.`
        : `${line.treatment.name} in your plan focuses here.`,
    );
  }
  return parts.join(" ");
}

export interface Mention {
  /** What the client asked about, in their words, e.g. "uneven tone". */
  phrase: string;
  text: string;
}

/**
 * What the client asked about that isn't among the three priorities. Saying plainly what the scan
 * sees there builds more trust than leaving the question unanswered.
 */
export function mentions(result: ScanResult, stated: Map<ConcernKey, string>, top: ConcernScore[], plan: Plan): Mention[] {
  const groups = new Map<string, ConcernScore[]>();
  for (const c of result.concerns) {
    const phrase = stated.get(c.key);
    if (phrase) groups.set(phrase, [...(groups.get(phrase) ?? []), c]);
  }
  const out: Mention[] = [];
  for (const [phrase, concerns] of groups) {
    // A priority already answers this one.
    if (concerns.some((c) => top.some((t) => t.key === c.key))) continue;
    const sorted = [...concerns].sort((a, b) => a.ui - b.ui);
    const lowest = sorted[0];
    if (lowest.ui >= STRONG) {
      const names = sentenceCase(joinLabels(sorted.map((c) => c.key)));
      out.push({
        phrase,
        text: `You mentioned ${phrase}. ${names} ${sorted.length === 1 ? "is" : "are"} among your stronger areas on this scan, so it isn't where we'd begin.`,
      });
      continue;
    }
    const line = plan.recommended.lines.find((l) => l.covers.includes(lowest.key));
    // "You mentioned redness. It's close behind", not "Redness is close behind".
    const name = label(lowest.key).toLowerCase() === phrase ? "It" : label(lowest.key);
    const is = name === "It" ? "'s" : " is";
    out.push({
      phrase,
      text: line
        ? `You mentioned ${phrase}. ${name}${is} close behind your top three, and ${line.treatment.name} in your plan works on it too.`
        : `You mentioned ${phrase}. ${name}${is} close behind your top three. We'll look at it together at your consultation.`,
    });
  }
  return out;
}

/** One sentence on why the plan looks the way it does. */
export function planRationale(plan: Plan): string {
  const [first, second] = plan.recommended.lines;
  if (!first) return "";
  const a = `${first.treatment.name} for ${joinLabels(first.covers)}`;
  if (!second) return `${a}.`;
  // Name what the second treatment adds, not what the first already covers.
  const adds = second.covers.filter((k) => !first.covers.includes(k));
  return `${a}, with ${second.treatment.name} alongside for ${joinLabels(adds.length > 0 ? adds : second.covers)}.`;
}
