// Report wording built from this client's own scores, answers and plan (DECISIONS D-045).
// Rules-based, so every line is true of the numbers on the page. The Claude-written report
// (Week 2) replaces these sentences, and these stay as its fallback (brief 8.3).

import type { ConcernScore, ScanResult } from "@/lib/domain";
import { joinLabels, type Plan, type Stated } from "@/lib/plan/build";
import { CONCERNS, type ConcernKey } from "@/lib/skin/concerns";

/** Scores at or above this read as a strength. */
const STRONG = 85;

const label = (k: ConcernKey) => CONCERNS[k].label;
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Pores are", "Firmness is": plural labels end in a single s. */
const isAre = (name: string) => (/[^s]s$/i.test(name) ? "are" : "is");

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

const ORDINALS = ["", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth"];

/**
 * Where a score sits among this client's own scores: "your third-lowest of the 15", or "your second-lowest,
 * level with redness" when another concern shows the same number. Only numbers the report shows.
 */
export function standing(concern: ConcernScore, all: ConcernScore[]): string {
  const position = all.filter((c) => c.ui < concern.ui).length;
  const level = all.filter((c) => c.key !== concern.key && c.ui === concern.ui).map((c) => c.key);
  const place = position === 0 ? "your lowest score" : `your ${ORDINALS[position] ?? `${position + 1}th`}-lowest score`;
  return level.length > 0 ? `${place}, level with ${joinLabels(level)}` : `${place} of the ${all.length}`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * The plain-words meaning under each of the three priorities. Every line is built from this client's own
 * scan, answers and plan, never a stock description: where the score sits among their own scores, whether
 * they asked about it, where HD saw it most, and which treatment in their plan works on it.
 */
export function priorityMeaning(
  rank: number,
  concern: ConcernScore,
  previous: ConcernScore[],
  stated: Map<ConcernKey, Stated>,
  plan: Plan,
  all: ConcernScore[],
): string {
  const asked = stated.get(concern.key);
  const name = label(concern.key).toLowerCase();
  const place = standing(concern, all);
  const parts: string[] = [];
  if (rank === 0) {
    // How far it stands out: the gap to the next score up, or who it's level with.
    const next = all.filter((c) => c.ui > concern.ui).sort((a, b) => a.ui - b.ui)[0];
    const tied = all.some((c) => c.key !== concern.key && c.ui === concern.ui);
    const lead = tied || !next ? sentenceCase(place) : `Your lowest score, ${plural(next.ui - concern.ui, "point")} under ${label(next.key).toLowerCase()}`;
    parts.push(`${lead}, and the area most likely to show visible change with treatment.`);
    if (asked) {
      parts.push(`You ${asked.ownWords ? "told us about" : "mentioned"} ${asked.phrase} too, so we're starting in the same place.`);
    }
  } else if (asked) {
    // Asking lifts a concern into the three; say so plainly when its score alone wouldn't have.
    const lifted = all.filter((c) => c.ui < concern.ui).length >= 3;
    const verb = asked.ownWords ? "told us about" : "mentioned";
    if (previous.some((p) => stated.get(p.key)?.phrase === asked.phrase)) {
      // "Uneven tone" covers pigmentation and radiance: the second one says so, rather than repeating the first.
      parts.push(`Part of the ${asked.phrase} you ${verb} shows here too: ${lifted ? `at ${concern.ui}, there's room to improve` : `it's ${place}`}.`);
    } else {
      const said = `You ${verb} ${asked.phrase}`;
      parts.push(lifted ? `${said}, so it's in your three. At ${concern.ui}, there's room to improve.` : `${said}, and your scan agrees: it's ${place}.`);
    }
  } else if (stated.size > 0) {
    parts.push(`You didn't mention ${name}, but your scan picked it up: it's ${place}.`);
  } else {
    parts.push(`${sentenceCase(place)}.`);
  }
  const where = mostVisibleArea(concern);
  if (where) parts.push(where);

  // Each priority is paired with the first treatment in the plan that works on it. "The same sessions"
  // only when a line above named that same treatment.
  const lineFor = (key: ConcernKey) => plan.recommended.lines.find((l) => l.covers.includes(key));
  const line = lineFor(concern.key);
  const sharing = line ? previous.filter((p) => lineFor(p.key)?.treatment.id === line.treatment.id).length : 0;
  if (!line) {
    parts.push("Your practitioner will talk you through the options at your consultation.");
  } else if (sharing >= 2) {
    parts.push(`One treatment, ${line.treatment.name}, works on all three.`);
  } else if (sharing === 1) {
    parts.push(`The same ${line.treatment.name} sessions work on this too.`);
  } else {
    parts.push(`${line.treatment.name} in your plan focuses here, across ${plural(line.sessions, "session")}.`);
  }
  return parts.join(" ");
}

export interface Mention {
  /** What the client asked about, in their words, e.g. "sun spots". */
  phrase: string;
  text: string;
}

/**
 * What the client asked about that isn't among the three priorities. Saying plainly what the scan
 * sees there builds more trust than leaving the question unanswered.
 */
export function mentions(result: ScanResult, stated: Map<ConcernKey, Stated>, top: ConcernScore[], plan: Plan): Mention[] {
  const groups = new Map<string, ConcernScore[]>();
  for (const c of result.concerns) {
    const phrase = stated.get(c.key)?.phrase;
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
      const verb = sorted.length > 1 ? "are" : isAre(names);
      out.push({ phrase, text: `You mentioned ${phrase}. ${names} ${verb} among your stronger areas on this scan, so it isn't where we'd begin.` });
      continue;
    }
    const line = plan.recommended.lines.find((l) => l.covers.includes(lowest.key));
    // "You mentioned redness. It's close behind", not "Redness is close behind".
    const subject = label(lowest.key).toLowerCase() === phrase ? "It's" : `${label(lowest.key)} ${isAre(label(lowest.key))}`;
    out.push({
      phrase,
      text: line
        ? `You mentioned ${phrase}. ${subject} close behind your top three, and ${line.treatment.name} in your plan works on it too.`
        : `You mentioned ${phrase}. ${subject} close behind your top three. We'll look at it together at your consultation.`,
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
