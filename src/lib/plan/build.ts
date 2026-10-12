// The treatment plan: chosen from the clinic's own menu, from this client's scores and answers.
// Pure and rules-based (brief 8.2 to 8.3, DECISIONS D-045). Every price and total is computed here, never
// written by a model. The Claude-written report (Week 2) adds wording on top, never different numbers.

import type { BudgetBand, Clinic, ConcernScore, Intake, Product, ScanResult, Treatment } from "@/lib/domain";
import { CONCERN_OPTIONS } from "@/lib/flow/intake-options";
import { currentReading, goalWords } from "@/lib/intake/goal-reading";
import { PROGRESS_SCAN_AFTER_DAYS } from "@/lib/rebook/thresholds";
import { CONCERNS, INTAKE_TO_CONCERNS, type ConcernKey } from "@/lib/skin/concerns";
import { offered, type SkinRule } from "@/lib/skin/fitzpatrick";

/** A concern the client ticked gets this many extra points of need, on a 0 to 100 scale. */
export const STATED_BOOST = 12;
/** A concern named in their own words counts for more: it's what they came in for. */
export const OWN_WORDS_BOOST = 20;
/** Asking about a concern only adds weight where the scan shows room to improve. */
const ROOM_BELOW = 92;
/** Concerns below this much need are left alone: the skin already looks good there. */
const MIN_NEED = 10;
/** Besides the three priorities, at most this many concerns the client asked about steer the plan. */
const EXTRA_STATED = 1;
/** A second treatment joins only if it adds at least this much need covered. */
const MIN_SECOND_VALUE = 15;
/** Ongoing treatments (monthly facials) are planned as a first course of this many. */
const ONGOING_COURSE = 3;
/** Days between the scan and the first suggested visit, so there's time to book. */
const LEAD_DAYS = 3;
/** A second treatment starts this long after the first, so visits don't stack up. */
const SECOND_OFFSET_DAYS = 7;
/** Any two visits sit at least this far apart, so one session has settled before the next. */
const MIN_GAP_DAYS = 7;
/** The progress scan comes this long after the last session. The rebook engine uses the same number. */
const PROGRESS_AFTER_DAYS = PROGRESS_SCAN_AFTER_DAYS;

/** Upper end of each budget band, in cents. Null: no upper end. */
export const BUDGET_CAP_CENTS: Record<BudgetBand, number | null> = {
  under_500: 50_000,
  "500_1000": 100_000,
  "1000_2000": 200_000,
  "2000_plus": null,
};

/**
 * Words in the client's own goal that point at a concern we measure, and how to say them back.
 * A function phrase repeats what they actually wrote ("sun spots", "age spots").
 */
const GOAL_WORDS: [RegExp, ConcernKey, string | ((match: string) => string)][] = [
  [/dark\s*circle|under[\s-]?eye\s+dark|darkness\s+under/i, "dark_circle_v2", "dark circles"],
  [/eye\s*bags?|puff/i, "eye_bag", "puffiness under the eyes"],
  [/hollow|tear\s*trough/i, "tear_trough", "under-eye hollows"],
  [/wrinkle|fine\s+lines?|crow'?s\s+feet|\blines\b/i, "wrinkle", (m) => (/wrinkle/i.test(m) ? "wrinkles" : /crow/i.test(m) ? "crow's feet" : "fine lines")],
  [/\bpores?\b/i, "pore", "pores"],
  [/texture|smooth|rough|bump/i, "texture", "texture"],
  [/(sun|age|dark|brown)\s*(spots?|patches)/i, "age_spot", (m) => m.toLowerCase().replace(/\s+/, " ").replace(/spot$/, "spots").replace(/patch$/, "patches")],
  [/pigment|melasma/i, "age_spot", "pigmentation"],
  [/uneven|\btone\b|\beven(er)?\s+(skin|complexion|colou?r)/i, "age_spot", "uneven tone"],
  [/redness|\bred\b|flush/i, "redness", "redness"],
  [/acne|breakout|blemish|pimple/i, "acne", "breakouts"],
  [/\bdry|dehydrat|hydrat|moistur/i, "moisture", "dryness"],
  [/\bdull|radian|bright|\bglow\b/i, "radiance", "dullness"],
  [/\boil|\bshin(e|y)\b/i, "oiliness", "shine"],
  [/sag|firm|jowl|loose|lift/i, "firmness", "firmness"],
  [/eyelid|hooded/i, "droopy_upper_eyelid", "your eyelids"],
];

export interface Stated {
  /** How the client put it, to say back to them: "sun spots", "uneven tone". */
  phrase: string;
  /** True when they wrote it themselves, not just ticked a box. */
  ownWords: boolean;
}

/**
 * Concerns the client asked about, in their own words or ticked in the intake. Their own words win:
 * "sun spots" says more than the "uneven tone" box ticked beside it. Claude's reading of their words is used
 * when there is one for what they wrote (D-079); the word list above stands in when there isn't.
 */
export function statedConcerns(intake: Intake | null): Map<ConcernKey, Stated> {
  const stated = new Map<ConcernKey, Stated>();
  if (!intake) return stated;
  const read = currentReading(intake);
  if (read) {
    for (const { key, phrase } of read) stated.set(key, { phrase, ownWords: true });
  } else {
    const words = goalWords(intake);
    for (const [re, key, phrase] of GOAL_WORDS) {
      const m = words.match(re);
      if (m && !stated.has(key)) stated.set(key, { phrase: typeof phrase === "string" ? phrase : phrase(m[0]), ownWords: true });
    }
  }
  for (const c of intake.concerns) {
    const phrase = (CONCERN_OPTIONS.find(([v]) => v === c)?.[1] ?? c).toLowerCase();
    for (const k of INTAKE_TO_CONCERNS[c]) if (!stated.has(k)) stated.set(k, { phrase, ownWords: false });
  }
  return stated;
}

/** How much a concern calls for attention: the gap to 100, plus weight for asking about it where there's room. */
export function needOf(c: Pick<ConcernScore, "key" | "ui">, stated: Map<ConcernKey, Stated>): number {
  const s = stated.get(c.key);
  const boost = s && c.ui < ROOM_BELOW ? (s.ownWords ? OWN_WORDS_BOOST : STATED_BOOST) : 0;
  return 100 - c.ui + boost;
}

/** Lowest first. YouCam's display scores bunch together, so ties fall to the finer raw measurement. */
const byScore = (a: ConcernScore, b: ConcernScore) => a.ui - b.ui || a.raw - b.raw;

/**
 * The report's three priorities. First, the lowest score: where the scan says to begin. Then the two that
 * matter most once the client's own goals are weighed in, so the report answers what they came in for.
 */
export function rankPriorities(result: ScanResult, stated: Map<ConcernKey, Stated>, count = 3): ConcernScore[] {
  const [lowest, ...rest] = [...result.concerns].sort(byScore);
  if (!lowest) return [];
  const next = rest.sort((a, b) => needOf(b, stated) - needOf(a, stated) || byScore(a, b));
  return [lowest, ...next.slice(0, count - 1)];
}

export interface FocusConcern {
  key: ConcernKey;
  ui: number;
  /** 100 minus the score, plus weight if the client asked about it (see needOf). */
  need: number;
  stated: boolean;
}

/**
 * The concerns the plan works on: the three priorities, plus the one the client asked about that
 * needs it most. Asking about a concern adds weight, so the plan leans toward their goal.
 */
export function focusConcerns(result: ScanResult, stated: Map<ConcernKey, Stated>): FocusConcern[] {
  const toFocus = (c: ConcernScore): FocusConcern => ({ key: c.key, ui: c.ui, stated: stated.has(c.key), need: needOf(c, stated) });
  const top = rankPriorities(result, stated).map(toFocus);
  const extra = result.concerns
    .map(toFocus)
    .filter((c) => c.stated && !top.some((t) => t.key === c.key) && c.ui < ROOM_BELOW)
    .sort((a, b) => b.need - a.need)
    .slice(0, EXTRA_STATED);
  return [...top.filter((c) => 100 - c.ui >= MIN_NEED || c.stated), ...extra].sort((a, b) => b.need - a.need || a.ui - b.ui);
}

export interface PlanLine {
  treatment: Treatment;
  sessions: number;
  /** The full course this treatment usually takes. */
  course: number;
  /** Focus concerns this treatment works on. */
  covers: ConcernKey[];
  totalCents: number;
}

export interface PlanOption {
  lines: PlanLine[];
  totalCents: number;
}

export type TimelineStep =
  | { kind: "session"; date: string; treatment: Treatment; session: number; of: number; first: boolean }
  | { kind: "progress"; date: string }
  | { kind: "event"; date: string };

export interface HomeCareItem {
  product: Product;
  reason: string;
}

export interface Plan {
  focus: FocusConcern[];
  recommended: PlanOption;
  /** A lighter plan inside the client's budget band, when the recommended one goes over it. */
  withinBudget: PlanOption | null;
  budgetCapCents: number | null;
  timeline: TimelineStep[];
  homeCare: HomeCareItem[];
  /** True when the event is too close for the full course, so sessions were cut to fit. */
  shortenedForEvent: boolean;
  /** Treatments that work on the focus but aren't offered to the client's skin type, so were never considered (D-094). */
  heldBack: Treatment[];
}

export interface PlanInput {
  result: ScanResult;
  intake: Intake | null;
  treatments: Treatment[];
  products: Product[];
  clinic: Pick<Clinic, "hours">;
  /** The scan date, "YYYY-MM-DD" in the clinic's time zone. Dates count from here, so the plan stays put. */
  from: string;
  /** The client's Fitzpatrick type, if known, and Dana's exceptions. Treatments that don't suit it are left out (D-094, D-095). */
  skin?: SkinRule | null;
}

// Dates are "YYYY-MM-DD" strings. The arithmetic runs at UTC noon, so no time zone or DST can shift a day.
const DAY_MS = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const shiftDate = (iso: string, days: number) => toIso(toTime(iso) + days * DAY_MS);

/** The first day on or after `iso` when the clinic is open. */
export function nextOpenDay(iso: string, hours: Clinic["hours"]): string {
  const open = Object.keys(hours.days).map(Number);
  if (open.length === 0) return iso;
  let day = iso;
  for (let i = 0; i < 7 && !open.includes(new Date(toTime(day)).getUTCDay()); i++) day = shiftDate(day, 1);
  return day;
}

const courseOf = (t: Treatment) => t.sessionsTypical ?? ONGOING_COURSE;

/** Session dates for one treatment, every `intervalDaysMin` days, each on an open day. */
function sessionDates(t: Treatment, start: string, count: number, hours: Clinic["hours"], taken: Set<string>): string[] {
  const dates: string[] = [];
  let day = start;
  for (let i = 0; i < count; i++) {
    let d = nextOpenDay(day, hours);
    // A second treatment's visit moves out of the week around any other visit.
    while ([...taken].some((t) => Math.abs(toTime(t) - toTime(d)) < MIN_GAP_DAYS * DAY_MS)) d = nextOpenDay(shiftDate(d, 1), hours);
    dates.push(d);
    taken.add(d);
    day = shiftDate(d, t.intervalDaysMin);
  }
  return dates;
}

/** How many sessions fit before the event, keeping each treatment's rest period clear. */
function sessionsBeforeEvent(t: Treatment, start: string, eventDate: string, hours: Clinic["hours"]): number {
  const last = shiftDate(eventDate, -t.minDaysBeforeEvent);
  return sessionDates(t, start, courseOf(t), hours, new Set()).filter((d) => d <= last).length;
}

const lineFor = (t: Treatment, sessions: number, focus: FocusConcern[]): PlanLine => ({
  treatment: t,
  sessions,
  course: courseOf(t),
  covers: focus.filter((f) => t.concerns.includes(f.key)).map((f) => f.key),
  totalCents: t.priceCents * sessions,
});

const option = (lines: PlanLine[]): PlanOption => ({ lines, totalCents: lines.reduce((n, l) => n + l.totalCents, 0) });

/**
 * How much of the focus need an option covers. Each concern counts once, through whichever treatment
 * does most for it, scaled by how much of that treatment's course is booked.
 */
function coverage(lines: PlanLine[], focus: FocusConcern[]): number {
  return focus.reduce((sum, f) => {
    const best = Math.max(0, ...lines.filter((l) => l.covers.includes(f.key)).map((l) => l.sessions / l.course));
    return sum + f.need * best;
  }, 0);
}

/**
 * The plan the skin calls for. The first treatment works on the lowest score, since the report says that's
 * where we'd begin (any treatment, if the menu has none for it). A second joins if it adds enough.
 */
function recommend(
  focus: FocusConcern[],
  lead: ConcernKey | undefined,
  maxSessions: Map<string, number>,
  treatments: Treatment[],
): PlanLine[] {
  const usable = treatments.filter((t) => (maxSessions.get(t.id) ?? 0) > 0);
  const full = (t: Treatment) => lineFor(t, maxSessions.get(t.id)!, focus);
  const byValue = (lines: PlanLine[]) => (a: Treatment, b: Treatment) =>
    coverage([...lines, full(b)], focus) - coverage([...lines, full(a)], focus) || full(a).totalCents - full(b).totalCents;

  const leading = usable.filter((t) => lead && t.concerns.includes(lead));
  const first = [...(leading.length > 0 ? leading : usable)].sort(byValue([]))[0];
  if (!first || coverage([full(first)], focus) === 0) return [];
  const lines = [full(first)];
  const base = coverage(lines, focus);
  const second = usable.filter((t) => t.id !== first.id).sort(byValue(lines))[0];
  if (second && coverage([...lines, full(second)], focus) - base >= MIN_SECOND_VALUE) lines.push(full(second));
  return lines;
}

/**
 * The best plan that fits under the cap: up to two treatments, with fewer sessions if need be.
 * Like the full plan, it begins with the lowest score whenever an option inside the budget can.
 */
function fitBudget(
  focus: FocusConcern[],
  lead: ConcernKey | undefined,
  maxSessions: Map<string, number>,
  treatments: Treatment[],
  cap: number,
): PlanLine[] {
  const choices: PlanLine[][] = [];
  const usable = treatments.filter((t) => (maxSessions.get(t.id) ?? 0) > 0);
  const counts = (t: Treatment) => Array.from({ length: maxSessions.get(t.id)! }, (_, i) => i + 1);
  for (const a of usable) {
    for (const sa of counts(a)) {
      choices.push([lineFor(a, sa, focus)]);
      for (const b of usable) {
        if (b.id <= a.id) continue;
        for (const sb of counts(b)) choices.push([lineFor(a, sa, focus), lineFor(b, sb, focus)]);
      }
    }
  }
  // A treatment that covers none of the focus is never worth paying for.
  const affordable = choices.filter((lines) => option(lines).totalCents <= cap && lines.every((l) => l.covers.length > 0));
  const leading = affordable.filter((lines) => lead && lines.some((l) => l.covers.includes(lead)));
  let best: { lines: PlanLine[]; value: number; cost: number } | null = null;
  for (const lines of leading.length > 0 ? leading : affordable) {
    const cost = option(lines).totalCents;
    const value = coverage(lines, focus);
    if (!best || value > best.value + 1e-9 || (Math.abs(value - best.value) < 1e-9 && cost < best.cost)) {
      best = { lines, value, cost };
    }
  }
  // The treatment that begins the plan comes first.
  return (best?.lines ?? []).sort((x, y) => Number(Boolean(lead && y.covers.includes(lead))) - Number(Boolean(lead && x.covers.includes(lead))));
}

/** Up to two retail products for the focus, plus sun protection whenever the plan includes light or resurfacing. */
function chooseHomeCare(focus: FocusConcern[], lines: PlanLine[], products: Product[]): HomeCareItem[] {
  const protects = lines.some((l) => l.treatment.screeningFlags.includes("sun_exposure"));
  const scored = products
    .map((p) => {
      const helps = focus.filter((f) => p.concerns.includes(f.key));
      const isSpf = /\bspf\b/i.test(p.name);
      const score = helps.reduce((n, f) => n + f.need, 0) + (protects && isSpf ? 1000 : 0);
      const reason =
        protects && isSpf
          ? "Protects your results between sessions."
          : helps.length > 0
            ? `Picked for ${joinLabels(helps.map((h) => h.key))}.`
            : p.description;
      return { product: p, reason, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.product.priceCents - b.product.priceCents);
  return scored.slice(0, 2).map(({ product, reason }) => ({ product, reason }));
}

/** "texture, pores and redness" from concern keys, in the client's words. */
export function joinLabels(keys: ConcernKey[]): string {
  const labels = keys.map((k) => CONCERNS[k].label.toLowerCase());
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Dates every session. Spacing visits can push one into the rest period before an event; that session
 * is dropped and its line repriced, so the timeline and the investment always agree.
 */
function buildTimeline(lines: PlanLine[], input: PlanInput, start: string, event: string | null): { lines: PlanLine[]; steps: TimelineStep[] } {
  const { hours } = input.clinic;
  const taken = new Set<string>();
  const steps: TimelineStep[] = [];
  const kept: PlanLine[] = [];
  lines.forEach((line, i) => {
    const begin = i === 0 ? start : shiftDate(start, SECOND_OFFSET_DAYS);
    const last = event ? shiftDate(event, -line.treatment.minDaysBeforeEvent) : null;
    const dates = sessionDates(line.treatment, begin, line.sessions, hours, taken).filter((d) => !last || d <= last);
    if (dates.length === 0) return;
    kept.push({ ...line, sessions: dates.length, totalCents: line.treatment.priceCents * dates.length });
    dates.forEach((date, n) =>
      steps.push({ kind: "session", date, treatment: line.treatment, session: n + 1, of: dates.length, first: false }),
    );
  });
  steps.sort((a, b) => a.date.localeCompare(b.date));
  const first = steps[0];
  if (first?.kind === "session") first.first = true;

  const last = steps[steps.length - 1]?.date ?? start;
  let progress = shiftDate(last, PROGRESS_AFTER_DAYS);
  // Before an event, the progress scan lands a few days ahead of it, never after.
  if (event && progress > shiftDate(event, -3)) progress = shiftDate(event, -3);
  if (steps.length > 0 && progress > last) steps.push({ kind: "progress", date: progress });
  if (event) steps.push({ kind: "event", date: event });
  return { lines: kept, steps };
}

export function buildPlan(input: PlanInput): Plan {
  const stated = statedConcerns(input.intake);
  const focus = focusConcerns(input.result, stated);
  const { hours } = input.clinic;
  const start = nextOpenDay(shiftDate(input.from, LEAD_DAYS), hours);
  const event = input.intake?.hasEvent && input.intake.eventDate && input.intake.eventDate > start ? input.intake.eventDate : null;
  const active = input.treatments.filter((t) => t.active);
  // A treatment the clinic doesn't offer to this skin type never reaches the plan or the budget option (D-094),
  // unless Dana has offered it to this client anyway (D-095).
  const treatments = active.filter((t) => offered(t, input.skin));
  const heldBack = active.filter((t) => !treatments.includes(t) && t.concerns.some((k) => focus.some((f) => f.key === k)));

  // No session inside a treatment's rest period before the event (brief 8.3).
  const maxSessions = new Map(
    treatments.map((t) => [t.id, event ? Math.min(courseOf(t), sessionsBeforeEvent(t, start, event, hours)) : courseOf(t)]),
  );
  const shortenedForEvent = event !== null && treatments.some((t) => (maxSessions.get(t.id) ?? 0) < courseOf(t));

  const lead = rankPriorities(input.result, stated, 1)[0]?.key;
  const timeline = buildTimeline(recommend(focus, lead, maxSessions, treatments), input, start, event);
  const recommendedLines = timeline.lines;
  const recommended = option(recommendedLines);
  const cap = input.intake?.budgetBand ? BUDGET_CAP_CENTS[input.intake.budgetBand] : null;
  let withinBudget: PlanOption | null = null;
  if (cap !== null && recommended.totalCents > cap) {
    const lines = fitBudget(focus, lead, maxSessions, treatments, cap);
    if (lines.length > 0) withinBudget = option(lines);
  }

  return {
    focus,
    recommended,
    withinBudget,
    budgetCapCents: cap,
    timeline: timeline.steps,
    homeCare: chooseHomeCare(focus, recommendedLines, input.products.filter((p) => p.active)),
    shortenedForEvent: shortenedForEvent && recommendedLines.some((l) => l.sessions < l.course),
    heldBack,
  };
}

/** "$1,845" from cents. Whole dollars: menu prices are whole. */
export function formatPrice(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
