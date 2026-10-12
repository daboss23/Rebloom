// The practitioner brief (brief 3.2, the mockup's third screen), worked out from one client's facts.
// Pure: the page only lays it out.

import type { Clinic, ConcernScore, Product, Scan, Treatment } from "@/lib/domain";
import { AGE_OPTIONS, BUDGET_OPTIONS, EVENT_OPTIONS, SCREENING_FLAG_TEXT, TREATMENT_OPTIONS } from "@/lib/flow/intake-options";
import { buildPlan, type Plan } from "@/lib/plan/build";
import type { ClientFacts } from "@/lib/rebook/engine";
import { concernLabel } from "@/lib/skin/concerns";
import { skinRule } from "@/lib/skin/fitzpatrick";

const labelOf = <K extends string>(options: [K, string][], key: K | null | undefined) => options.find(([k]) => k === key)?.[1] ?? null;

/** The plan the client's latest report suggests, from the clinic's own menu. Null before any scan. */
export function suggestedPlan(
  book: { input: { treatments: Treatment[]; products: Product[]; clinic: Pick<Clinic, "hours" | "timezone"> } },
  facts: ClientFacts,
): { scan: Scan; plan: Plan } | null {
  const scan = facts.scans[facts.scans.length - 1];
  if (!scan?.result) return null;
  const from = new Intl.DateTimeFormat("en-CA", { timeZone: book.input.clinic.timezone }).format(new Date(scan.createdAt));
  const plan = buildPlan({
    result: scan.result,
    intake: facts.intake,
    treatments: book.input.treatments,
    products: book.input.products,
    clinic: book.input.clinic,
    from,
    skin: skinRule(facts.client),
  });
  return { scan, plan };
}

export interface ScoreLine {
  score: ConcernScore;
  label: string;
  /** ui scores across scans, oldest first. */
  series: number[];
  delta: number | null;
}

/** The lowest five scores on the latest scan, each with its path across every scan. */
export function lowestScores(facts: ClientFacts, count = 5): ScoreLine[] {
  const latest = facts.scans[facts.scans.length - 1];
  if (!latest?.result) return [];
  return [...latest.result.concerns]
    .sort((a, b) => a.ui - b.ui)
    .slice(0, count)
    .map((score) => {
      const series = facts.scans.map((s) => s.result!.concerns.find((c) => c.key === score.key)?.ui).filter((v): v is number => v !== undefined);
      return { score, label: concernLabel(score.key), series, delta: series.length > 1 ? series[series.length - 1] - series[0] : null };
    });
}

export interface BriefFacts {
  age: string | null;
  event: string | null;
  budget: string | null;
  pastTreatments: string;
  skinType: string | null;
  skinAge: number | null;
  /** Practitioner-facing prompts for a "yes" in screening. Prompts for judgement, never decisions. */
  flags: string[];
}

export function briefFacts(facts: ClientFacts): BriefFacts {
  const intake = facts.intake;
  const latest = facts.scans[facts.scans.length - 1];
  const event =
    intake?.hasEvent && intake.eventDate
      ? `${labelOf(EVENT_OPTIONS, intake.eventType) ?? "Event"} · ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
          new Date(`${intake.eventDate}T12:00:00Z`),
        )}`
      : null;
  const past = (intake?.pastTreatments ?? []).map((t) => labelOf(TREATMENT_OPTIONS, t)).filter(Boolean);
  const flags = Object.entries(intake?.screening ?? {})
    .filter(([, answer]) => answer === "yes" || answer === "unsure")
    .map(([key, answer]) => `${SCREENING_FLAG_TEXT[key as keyof typeof SCREENING_FLAG_TEXT]}${answer === "unsure" ? " (Answered unsure.)" : ""}`);
  if (intake?.sensitivitiesNote) flags.push(`In their words: "${intake.sensitivitiesNote}"`);
  return {
    age: labelOf(AGE_OPTIONS, facts.client.ageRange),
    event,
    budget: labelOf(BUDGET_OPTIONS, intake?.budgetBand),
    pastTreatments: past.length ? past.join(", ") : "None",
    skinType: latest?.result?.skinType ? latest.result.skinType[0].toUpperCase() + latest.result.skinType.slice(1) : null,
    skinAge: latest?.result?.skinAge ?? null,
    flags,
  };
}
