import type { Metadata } from "next";
import Link from "next/link";
import { CountUp } from "@/components/dashboard/CountUp";
import { LightField } from "@/components/dashboard/LightField";
import { MonthBars } from "@/components/dashboard/MonthBars";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { IconArrowRight } from "@/components/ui/Icons";
import { computeInsights } from "@/lib/dashboard/insights";
import { loadBook } from "@/lib/dashboard/load";
import { formatPrice } from "@/lib/plan/build";

export const metadata: Metadata = { title: "Insights" };

const percent = (rate: number | null) => (rate === null ? "None yet" : `${Math.round(rate * 100)}%`);

/** The owner's view: four numbers and one chart. That's it. */
export default async function InsightsPage() {
  const book = await loadBook();
  const prices = new Map(book.input.treatments.map((t) => [t.id, t.priceCents]));
  const insights = computeInsights(book.facts, {
    today: book.today,
    timeZone: book.clinic.timezone,
    atRiskIds: new Set(book.queue.items.filter((i) => i.atRisk).map((i) => i.clientId)),
    treatmentPrice: (id) => prices.get(id) ?? 0,
  });
  const first = insights.months[0];
  const last = insights.months[insights.months.length - 1];

  return (
    <div>
      <PageHeader kicker={`${book.clinic.name} · ${first.label} to ${last.label}`} title="Insights" />

      <section aria-labelledby="kept" className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="sea on-dark focus-in relative overflow-hidden rounded-[28px] p-8 shadow-[0_40px_80px_-40px_rgba(12,26,34,0.7)] sm:p-10" style={{ animationDelay: "60ms" }}>
          <LightField variant="sea" className="opacity-60" />
          <div className="relative flex h-full flex-col">
            <h2 id="kept" className="text-[0.75rem] uppercase tracking-[0.22em] text-[#e2c07a]">
              Revenue kept through rebooking
            </h2>
            <p className="gold-foil mt-6 font-display text-[clamp(72px,9vw,128px)] font-light leading-[0.9] tracking-[-0.035em]">
              <CountUp value={Math.round(insights.keptCents / 100)} format="money" duration={1600} delay={200} />
            </p>
            <p className="mt-6 max-w-sm text-[0.9375rem] leading-relaxed text-[#dbe8ef]">
              Every treatment visit after a client&apos;s first, over the last six months. The second visit, and every one
              after it.
            </p>
            <p className="mt-auto pt-8 text-[0.8125rem] text-ink-soft">
              This month so far: <span className="text-white">{formatPrice(insights.keptThisMonthCents)}</span>
            </p>
          </div>
        </div>

        <div className="glass focus-in min-w-0 p-6 sm:p-8" style={{ animationDelay: "140ms" }}>
          <h2 className="font-display text-[1.625rem] font-light text-ink">Revenue kept, month by month</h2>
          <div className="mt-6">
            <MonthBars months={insights.months} title="Revenue kept through rebooking, by month" />
          </div>
        </div>
      </section>

      <dl className="mt-6 grid gap-6 sm:grid-cols-3">
        {[
          {
            term: "Rebook rate",
            value: percent(insights.rebook.rate),
            note: `${insights.rebook.yes} of ${insights.rebook.of} clients came back after their first treatment, or are booked to.`,
          },
          {
            term: "Reports that became bookings",
            value: percent(insights.reportsToBookings.rate),
            note: `${insights.reportsToBookings.yes} of ${insights.reportsToBookings.of} clients with a report booked a visit.`,
          },
          {
            term: "Clients at risk",
            value: String(insights.atRisk),
            note: "Stalled, missed or lapsed. Each one is in the rebook queue with the reason.",
            href: "/dashboard/rebook",
          },
        ].map((stat, i) => (
          <div key={stat.term} className="glass lift focus-in p-7" style={{ animationDelay: `${220 + i * 80}ms` }}>
            <dt className="t-label">{stat.term}</dt>
            <dd className="mt-4 font-display text-[4.5rem] font-light leading-none tracking-[-0.02em] text-ink">{stat.value}</dd>
            <dd className="mt-4 max-w-xs text-[0.875rem] leading-relaxed text-text-2">{stat.note}</dd>
            {stat.href && (
              <dd className="mt-3">
                <Link href={stat.href} className="group inline-flex items-center gap-2 text-[0.875rem] text-ink">
                  Open the queue
                  <IconArrowRight width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </dd>
            )}
          </div>
        ))}
      </dl>

      <p className="t-caption mt-6 !text-[0.8125rem]">Demo data: twelve demo clients, dated around today, plus anyone who scans in this browser.</p>
    </div>
  );
}
