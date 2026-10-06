import type { Metadata } from "next";
import { PageHeader, pill } from "@/components/dashboard/PageHeader";
import { ClinicWordmark } from "@/components/ui/Wordmarks";
import { loadBook } from "@/lib/dashboard/load";
import { env, features } from "@/lib/env";
import { formatPrice } from "@/lib/plan/build";
import { concernLabel } from "@/lib/skin/concerns";

export const metadata: Metadata = { title: "Settings" };

// Brief 3.2, Settings · Integrations: shown, never built. Plain text names, no logos.
const CONNECTS_TO = [
  ["Boulevard", "Booking and client records"],
  ["Vagaro", "Booking and payments"],
  ["Zenoti", "Multi-location booking"],
  ["Mindbody", "Booking and memberships"],
  ["Square Appointments", "Booking and payments"],
  ["Webhooks and Zapier", "Send events anywhere"],
] as const;

const interval = (min: number, max: number) => (min === max ? `Every ${min} days` : `Every ${min} to ${max} days`);

export default async function SettingsPage() {
  const book = await loadBook();
  const { clinic } = book;
  const { treatments, products } = book.input;

  return (
    <div>
      <PageHeader
        kicker={clinic.name}
        title="Settings"
        aside={
        <nav aria-label="Settings sections">
          <ul className="flex flex-wrap gap-2">
            {[
              ["#menu", "Menu"],
              ["#brand", "Brand"],
              ["#connects", "Connects to"],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className={pill(false)}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        }
      />

      {/* ---------- Menu ---------- */}
      <section id="menu" aria-labelledby="menu-title" className="glass focus-in mt-10 scroll-mt-28 p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="menu-title" className="font-display text-[34px] font-light text-ink">
            Menu
          </h2>
          <p className="t-caption !text-[12.5px]">The only list the AI may recommend from. Demo prices.</p>
        </div>
        <table className="mt-5 w-full border-collapse text-left">
          <caption className="sr-only">Treatments</caption>
          <thead>
            <tr className="border-b border-[#0c1a22]/10">
              <th scope="col" className="t-label py-3 pr-4 font-normal">Treatment</th>
              <th scope="col" className="t-label hidden py-3 pr-4 font-normal md:table-cell">Course</th>
              <th scope="col" className="t-label hidden py-3 pr-4 font-normal lg:table-cell">For</th>
              <th scope="col" className="t-label py-3 text-right font-normal">Per session</th>
            </tr>
          </thead>
          <tbody>
            {treatments.map((t) => (
              <tr key={t.id} className="border-b border-[#0c1a22]/[0.06] align-top last:border-0">
                <td className="py-4 pr-4">
                  <p className="text-[15px] text-ink">{t.name}</p>
                  <p className="t-caption mt-0.5 max-w-md !text-[13px]">{t.description}</p>
                </td>
                <td className="hidden py-4 pr-4 text-[14px] text-text-2 md:table-cell">
                  {t.sessionsTypical ? `${t.sessionsTypical} sessions` : "Ongoing"}
                  <span className="t-caption block !text-[12.5px]">{interval(t.intervalDaysMin, t.intervalDaysMax)}</span>
                </td>
                <td className="hidden py-4 pr-4 text-[13.5px] text-text-2 lg:table-cell">{t.concerns.map(concernLabel).join(", ")}</td>
                <td className="py-4 text-right font-display text-[26px] font-light text-ink">{formatPrice(t.priceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="mt-10 w-full border-collapse text-left">
          <caption className="sr-only">Home care</caption>
          <thead>
            <tr className="border-b border-[#0c1a22]/10">
              <th scope="col" className="t-label py-3 pr-4 font-normal">Home care</th>
              <th scope="col" className="t-label hidden py-3 pr-4 font-normal lg:table-cell">For</th>
              <th scope="col" className="t-label py-3 text-right font-normal">Price</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-[#0c1a22]/[0.06] align-top last:border-0">
                <td className="py-4 pr-4">
                  <p className="text-[15px] text-ink">{p.name}</p>
                  <p className="t-caption mt-0.5 max-w-md !text-[13px]">{p.description}</p>
                </td>
                <td className="hidden py-4 pr-4 text-[13.5px] text-text-2 lg:table-cell">{p.concerns.map(concernLabel).join(", ")}</td>
                <td className="py-4 text-right font-display text-[22px] font-light text-ink tabular-nums">{formatPrice(p.priceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------- Brand ---------- */}
      <section id="brand" aria-labelledby="brand-title" className="glass focus-in mt-6 scroll-mt-28 p-6 sm:p-8">
        <h2 id="brand-title" className="font-display text-[34px] font-light text-ink">
          Brand
        </h2>
        <p className="t-caption mt-1 !text-[12.5px]">What clients see on their scan and report. Rebloom stays out of the way.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-[16px] bg-[#f7f4ef] p-8 shadow-[inset_0_0_0_1px_rgba(28,28,26,0.06)]">
            <ClinicWordmark clinic={clinic} />
            <p className="mt-10 font-display text-[30px] font-light leading-tight text-[#1c1c1a]">See your skin clearly.</p>
            <p className="mt-2 text-[13px] text-[#5e655f]">
              {clinic.city} · Client pages use the clinic&apos;s own colors
            </p>
          </div>
          <dl className="rounded-[16px] bg-white/70 p-6 ring-1 ring-inset ring-white">
            {[
              ["Name", clinic.name],
              ["Wordmark", clinic.wordmark],
              ["Accent", clinic.accentHex.toUpperCase()],
              ["Deposit", formatPrice(clinic.depositCents)],
            ].map(([term, value]) => (
              <div key={term} className="flex items-baseline justify-between gap-4 border-b border-[#0c1a22]/[0.06] py-3 last:border-0">
                <dt className="t-label !text-[10.5px]">{term}</dt>
                <dd className="flex items-center gap-2 text-[14px] text-ink">
                  {term === "Accent" && <span aria-hidden className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: clinic.accentHex }} />}
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- Connects to ---------- */}
      <section id="connects" aria-labelledby="connects-title" className="glass focus-in mt-6 scroll-mt-28 p-6 sm:p-8">
        <h2 id="connects-title" className="font-display text-[34px] font-light text-ink">
          Connects to
        </h2>
        <ul className="mt-5">
          <li className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#0c1a22]/[0.06] py-4">
            <span>
              <span className="text-[15px] text-ink">Stripe</span>
              <span className="t-caption ml-3 !text-[13px]">Deposits at booking</span>
            </span>
            <span className="text-[13px] text-text-2">{env.STRIPE_SECRET_KEY ? "Connected · Test mode" : "Test mode · Not connected yet"}</span>
          </li>
          <li className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#0c1a22]/[0.06] py-4">
            <span>
              <span className="text-[15px] text-ink">Email</span>
              <span className="t-caption ml-3 !text-[13px]">Reports and rebook messages</span>
            </span>
            <span className="text-[13px] text-text-2">
              {env.DEMO_MODE ? "Demo mode · Logged, not sent" : features.email ? "Connected" : "Not connected yet"}
            </span>
          </li>
        </ul>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTS_TO.map(([name, what]) => (
            <li key={name} className="lift sheen relative rounded-[16px] bg-white/70 p-6 ring-1 ring-inset ring-white shadow-[0_16px_32px_-24px_rgba(12,44,62,0.4)]">
              <p className="text-[15px] text-ink">{name}</p>
              <p className="t-caption mt-1 !text-[13px]">{what}</p>
              <p className="mt-6 inline-flex rounded-full bg-[#9fc9dd]/30 px-2.5 py-1 text-[10.5px] uppercase tracking-[0.14em] text-[#174a63]">Coming soon</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
