import type { Metadata } from "next";
import Link from "next/link";
import { MonthBars } from "@/components/dashboard/MonthBars";
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
      <header className="reveal">
        <p className="t-label">
          {book.clinic.name} · {first.label} to {last.label}
        </p>
        <h1 className="mt-3 font-display text-[clamp(40px,5vw,56px)] font-light leading-[1.02] tracking-[-0.02em] text-ink">Insights</h1>
      </header>

      <section aria-labelledby="kept" className="mt-14 grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="reveal" style={{ animationDelay: "60ms" }}>
          <h2 id="kept" className="t-label">
            Revenue kept through rebooking
          </h2>
          <p className="mt-4 font-display text-[clamp(72px,10vw,132px)] font-light leading-[0.9] tracking-[-0.035em] text-ink tabular-nums">
            {formatPrice(insights.keptCents)}
          </p>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-text-2">
            Every treatment visit after a client&apos;s first, over the last six months. The second visit, and every one
            after it.
          </p>
          <p className="t-caption mt-3">
            This month so far: <span className="text-ink">{formatPrice(insights.keptThisMonthCents)}</span>
          </p>
        </div>

        <div className="reveal min-w-0" style={{ animationDelay: "120ms" }}>
          <h2 className="t-label">Revenue kept, month by month</h2>
          <div className="mt-6">
            <MonthBars months={insights.months} title="Revenue kept through rebooking, by month" />
          </div>
        </div>
      </section>

      <dl className="mt-20 grid gap-x-12 sm:grid-cols-3">
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
          <div key={stat.term} className="reveal border-t border-ink/70 pt-5 pb-10" style={{ animationDelay: `${180 + i * 60}ms` }}>
            <dt className="t-label">{stat.term}</dt>
            <dd className="mt-3 font-display text-[64px] font-light leading-none tracking-[-0.02em] text-ink tabular-nums">{stat.value}</dd>
            <dd className="mt-4 max-w-xs text-[14px] leading-relaxed text-text-2">{stat.note}</dd>
            {stat.href && (
              <dd className="mt-3">
                <Link href={stat.href} className="group inline-flex items-center gap-2 text-[13.5px] text-ink">
                  Open the queue
                  <IconArrowRight width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </dd>
            )}
          </div>
        ))}
      </dl>

      <p className="t-caption mt-6 !text-[12.5px]">Demo data: twelve demo clients, dated around today, plus anyone who scans in this browser.</p>
    </div>
  );
}
