import "server-only";
// The landing page's look at the product (DECISIONS D-059): the same twelve demo clients a judge gets on
// entering the dashboard, run through the same engine. Nothing here is typed in; if the engine, the cast
// or the menu changes, the landing page changes with it.

import { MAISON_VERRE } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { DANA, SEED_STAFF } from "@/data/staff";
import { isoDateInZone, virtualNow } from "@/lib/clock";
import { buildDemoBundle } from "@/lib/demo/seed";
import { computeInsights, type MonthBar } from "@/lib/dashboard/insights";
import { fullName, leadTrend, visitsOn } from "@/lib/dashboard/view";
import type { ISODate } from "@/lib/domain";
import { env } from "@/lib/env";
import { stableId } from "@/lib/ids";
import { nextOpenDay, shiftDate } from "@/lib/plan/build";
import { bestChange, buildQueue, clientFacts, priorityKeys, TRIGGER_LABEL, type ClientFacts, type EngineInput, type TriggerKind } from "@/lib/rebook/engine";
import { concernLabel } from "@/lib/skin/concerns";

export interface PreviewRow {
  name: string;
  kind: TriggerKind;
  label: string;
  atRisk: boolean;
  reason: string;
  valueCents: number | null;
  valueNote: string | null;
}

export interface LandingPreview {
  clinicName: string;
  practitioner: string;
  /** "YYYY-MM-DD" in the clinic's time zone. */
  today: ISODate;
  /** Everyone waiting on the practitioner, most pressing first. */
  rows: PreviewRow[];
  /** Sample clients in the demo clinic. */
  clientCount: number;
  /** Visits on the next open day: today, or the day the clinic opens again. */
  visits: { count: number; day: string };
  readyCents: number;
  /** Insights: revenue from every treatment visit after a client's first, over six months. */
  keptCents: number;
  months: MonthBar[];
  rebook: { rate: number | null; of: number; yes: number };
  atRisk: number;
  /** The demo's fullest progress story: the most improved client across the most scans. */
  story: {
    name: string;
    firstName: string;
    label: string;
    /** Display scores, one per scan, oldest first. */
    series: number[];
    delta: number;
    /** The raw measurement underneath, first scan and latest: what progress is judged on (D-009). */
    raw: { from: number; to: number };
    weeks: number;
  } | null;
  /** What that client's first report put first, and the treatments it suggested. */
  report: { firstName: string; priorities: { label: string; score: number }[]; treatments: { name: string; sessions: number }[]; totalCents: number } | null;
  /** The first progress moment's drafted email, without its link. */
  moment: { name: string; subject: string; paragraphs: string[] } | null;
  /** The menu's signature course, for the cost of a client who stops after one session. */
  course: { name: string; sessions: number; priceCents: number };
}

/** A fresh sandbox's view of the demo clinic, as of `now` (the demo clock, unmoved, by default). */
export function landingPreview(now: Date = virtualNow({ demoToday: env.DEMO_TODAY })): LandingPreview {
  const clinic = MAISON_VERRE;
  const treatments = SEED_TREATMENTS.filter((t) => t.clinicId === clinic.id);
  const products = SEED_PRODUCTS.filter((p) => p.clinicId === clinic.id);
  const today = isoDateInZone(now, clinic.timezone);
  const b = buildDemoBundle({ clinic, treatments, products, staff: SEED_STAFF, sandboxId: "landing", today });

  // Ordered as the store hands them to the dashboard, so both read the same story.
  const byCreated = <T extends { createdAt: string }>(rows: T[]) => [...rows].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const input: EngineInput = {
    clinic,
    practitionerName: DANA.name,
    now,
    reportUrl: (token) => `/r/${token}`,
    treatments,
    products,
    clients: [...b.clients].sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
    consents: b.consents,
    intakes: b.intakes,
    scans: byCreated(b.scans),
    reports: b.reports,
    plans: byCreated(b.plans).map((p) => ({
      ...p,
      items: b.planItems.filter((i) => i.planId === p.id).sort((x, y) => x.position - y.position),
    })),
    appointments: [...b.appointments].sort((x, y) => x.startsAt.localeCompare(y.startsAt)),
    messages: byCreated(b.messages),
  };

  const facts = clientFacts(input);
  const queue = buildQueue(input);
  const byId = new Map(facts.map((f) => [f.client.id, f]));
  const prices = new Map(treatments.map((t) => [t.id, t.priceCents]));
  const insights = computeInsights(facts, {
    today,
    timeZone: clinic.timezone,
    atRiskIds: new Set(queue.items.filter((i) => i.atRisk).map((i) => i.clientId)),
    treatmentPrice: (id) => prices.get(id) ?? 0,
  });

  // The menu's signature course: the peel series, or failing that the first treatment sold as a course.
  // A closed day has no visits: show the day the clinic opens again, as the dashboard does.
  const open = Boolean(clinic.hours.days[new Date(`${today}T12:00:00Z`).getUTCDay() as 0]);
  const visitsDay = open ? today : nextOpenDay(shiftDate(today, 1), clinic.hours);
  const visitsLabel = open
    ? "today"
    : new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${visitsDay}T12:00:00Z`));

  const signature =
    treatments.find((t) => t.id === stableId(`treatment:${clinic.slug}:peel-series`)) ??
    treatments.find((t) => (t.sessionsTypical ?? 0) > 1) ??
    treatments[0];
  const momentItem = queue.items.find((i) => i.kind === "progress_moment" && i.draft);

  return {
    clinicName: clinic.name,
    practitioner: DANA.name,
    today,
    rows: queue.items.map((item) => ({
      name: fullName(byId.get(item.clientId)!.client),
      kind: item.kind,
      label: TRIGGER_LABEL[item.kind],
      atRisk: item.atRisk,
      reason: item.reason,
      valueCents: item.valueCents,
      valueNote: item.valueNote,
    })),
    clientCount: facts.filter((f) => f.client.demoKey).length,
    visits: { count: visitsOn(visitsDay, facts, treatments, clinic.timezone).length, day: visitsLabel },
    readyCents: queue.items.reduce((n, i) => n + (i.valueCents ?? 0), 0),
    keptCents: insights.keptCents,
    months: insights.months,
    rebook: insights.rebook,
    atRisk: insights.atRisk,
    ...storyOf(facts, treatments),
    moment: momentItem
      ? {
          name: fullName(byId.get(momentItem.clientId)!.client),
          subject: momentItem.draft!.subject,
          // The link is the client's private report: never on a public page.
          paragraphs: momentItem.draft!.body.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p && !/^(\/|https?:)/.test(p)),
        }
      : null,
    course: { name: signature.name, sessions: Math.max(signature.sessionsTypical ?? 2, 2), priceCents: signature.priceCents },
  };
}

/** The client with the most measured change over the most scans, and the first report they were given. */
function storyOf(facts: ClientFacts[], treatments: EngineInput["treatments"]): Pick<LandingPreview, "story" | "report"> {
  const candidates = facts
    .map((f) => ({ f, best: bestChange(f) }))
    .filter((c): c is { f: ClientFacts; best: NonNullable<ReturnType<typeof bestChange>> } => c.best !== null && c.best.uiDelta > 0)
    .sort((a, b) => b.f.scans.length - a.f.scans.length || b.best.uiDelta - a.best.uiDelta);
  const top = candidates[0];
  if (!top) return { story: null, report: null };
  const { f, best } = top;
  const trend = leadTrend(f, best.key)!;
  const first = f.scans[0];
  const last = f.scans[f.scans.length - 1];
  const rawOf = (scan: typeof first) => scan.result!.concerns.find((c) => c.key === best.key)?.raw ?? 0;
  const weeks = Math.round((Date.parse(last.createdAt) - Date.parse(first.createdAt)) / (7 * 86_400_000));
  const lines = (f.plan?.items ?? []).flatMap((item) => {
    const t = treatments.find((x) => x.id === item.treatmentId);
    return t ? [{ name: t.name, sessions: item.quantity, cents: item.quantity * item.unitPriceCents }] : [];
  });
  return {
    story: {
      name: fullName(f.client),
      firstName: f.client.firstName!,
      label: trend.label,
      series: trend.series,
      delta: trend.delta ?? 0,
      raw: { from: Math.round(rawOf(first)), to: Math.round(rawOf(last)) },
      weeks,
    },
    report: {
      firstName: f.client.firstName!,
      priorities: priorityKeys(f)
        .slice(0, 3)
        .map((key) => ({ label: concernLabel(key), score: first.result!.concerns.find((c) => c.key === key)?.ui ?? 0 })),
      treatments: lines.map(({ name, sessions }) => ({ name, sessions })),
      totalCents: lines.reduce((n, l) => n + l.cents, 0),
    },
  };
}
