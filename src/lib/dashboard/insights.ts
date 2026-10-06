// The owner's numbers (brief 3.2, Insights). Four numbers and one chart, every one computed from the rows,
// never typed in. Definitions live here so the page and the tests agree on them.

import type { ISODate } from "@/lib/domain";
import { isoDateInZone } from "@/lib/clock";
import type { ClientFacts } from "@/lib/rebook/engine";

export interface MonthBar {
  /** "2026-10" */
  month: string;
  /** "Oct" */
  label: string;
  cents: number;
  /** The month we're in: part done, part booked. */
  current: boolean;
}

export interface Insights {
  /** Revenue from every treatment visit after a client's first, over the chart's months. */
  keptCents: number;
  keptThisMonthCents: number;
  months: MonthBar[];
  /** Of clients whose first treatment is done, the share with another visit done or booked. */
  rebook: { rate: number | null; of: number; yes: number };
  /** Of clients who received a report, the share who booked anything. */
  reportsToBookings: { rate: number | null; of: number; yes: number };
  atRisk: number;
}

export function computeInsights(
  facts: ClientFacts[],
  opts: { today: ISODate; timeZone: string; atRiskIds: Set<string>; treatmentPrice: (treatmentId: string) => number; months?: number },
): Insights {
  const count = opts.months ?? 6;
  const monthOf = (instant: string) => isoDateInZone(new Date(instant), opts.timeZone).slice(0, 7);
  const [y, m] = opts.today.split("-").map(Number);
  const months: MonthBar[] = Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 15));
    const month = d.toISOString().slice(0, 7);
    return {
      month,
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d),
      cents: 0,
      current: i === count - 1,
    };
  });
  const byMonth = new Map(months.map((b) => [b.month, b]));

  let rebookOf = 0;
  let rebookYes = 0;
  let reportsOf = 0;
  let reportsYes = 0;

  for (const f of facts) {
    if (!f.client.firstName || f.scans.length === 0) continue;
    const visits = f.appointments.filter((a) => a.status === "completed" || a.status === "booked");
    const treatments = visits.filter((a) => a.treatmentId);

    // Every treatment after the first is revenue the clinic kept by bringing them back.
    treatments.slice(1).forEach((a) => {
      const bar = byMonth.get(monthOf(a.startsAt));
      if (bar) bar.cents += opts.treatmentPrice(a.treatmentId!);
    });

    const firstDone = treatments.find((a) => a.status === "completed");
    if (firstDone) {
      rebookOf++;
      if (treatments.some((a) => a.startsAt > firstDone.startsAt)) rebookYes++;
    }

    if (f.report && f.client.email) {
      reportsOf++;
      if (visits.length > 0) reportsYes++;
    }
  }

  const rate = (yes: number, of: number) => (of === 0 ? null : yes / of);
  return {
    keptCents: months.reduce((n, b) => n + b.cents, 0),
    keptThisMonthCents: months[months.length - 1].cents,
    months,
    rebook: { rate: rate(rebookYes, rebookOf), of: rebookOf, yes: rebookYes },
    reportsToBookings: { rate: rate(reportsYes, reportsOf), of: reportsOf, yes: reportsYes },
    atRisk: facts.filter((f) => opts.atRiskIds.has(f.client.id)).length,
  };
}
