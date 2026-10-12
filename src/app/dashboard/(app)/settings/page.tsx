import type { Metadata } from "next";
import { PageHeader, pill } from "@/components/dashboard/PageHeader";
import { DepositSwitch } from "@/components/dashboard/DepositSwitch";
import { ReplyAlerts } from "@/components/dashboard/ReplyAlerts";
import { ClientPagePreview } from "@/components/flow/ClientPagePreview";
import { NOTICE_HOURS } from "@/lib/booking/service";
import { loadBook } from "@/lib/dashboard/load";
import type { OpeningHours } from "@/lib/domain";
import { getStore } from "@/lib/store";
import { env, features } from "@/lib/env";
import { formatPrice } from "@/lib/plan/build";
import { formatUsPhone } from "@/lib/sms/text";
import { concernLabel } from "@/lib/skin/concerns";
import { limitLabel } from "@/lib/skin/fitzpatrick";

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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const twelve = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
/** "Tuesday to Saturday, 10am to 6pm" when every open day keeps the same hours, otherwise one day at a time. */
function hoursText(hours: OpeningHours): string {
  const open = ([0, 1, 2, 3, 4, 5, 6] as const).filter((d) => hours.days[d]);
  if (open.length === 0) return "Closed";
  const same = open.every((d) => hours.days[d]!.open === hours.days[open[0]]!.open && hours.days[d]!.close === hours.days[open[0]]!.close);
  const run = open.every((d, i) => i === 0 || d === open[i - 1] + 1);
  const span = (d: (typeof open)[number]) => `${twelve(hours.days[d]!.open)} to ${twelve(hours.days[d]!.close)}`;
  if (same && run && open.length > 1) return `${DAY_NAMES[open[0]]} to ${DAY_NAMES[open[open.length - 1]]}, ${span(open[0])}`;
  return open.map((d) => `${DAY_NAMES[d]} ${span(d)}`).join(" · ");
}

const interval = (min: number, max: number) => (min === max ? `Every ${min} days` : `Every ${min} to ${max} days`);

export default async function SettingsPage() {
  const book = await loadBook();
  const { clinic } = book;
  const { treatments, products } = book.input;
  const settings = await getStore().getClinicSettings(clinic.id, book.sandboxId);

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
              ["#booking", "Booking"],
              ["#replies", "Replies"],
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
          <h2 id="menu-title" className="font-display text-[2.125rem] font-light text-ink">
            Menu
          </h2>
          <p className="t-caption !text-[0.8125rem]">The only list the AI may recommend from. Demo prices.</p>
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
                  <p className="text-[0.9375rem] text-ink">{t.name}</p>
                  <p className="t-caption mt-0.5 max-w-md !text-[0.8125rem]">{t.description}</p>
                  {limitLabel(t.fitzpatrickMax) && (
                    <p className="mt-1 text-[0.8125rem] text-text-2">Skin {limitLabel(t.fitzpatrickMax)} only</p>
                  )}
                </td>
                <td className="hidden py-4 pr-4 text-[0.875rem] text-text-2 md:table-cell">
                  {t.sessionsTypical ? `${t.sessionsTypical} sessions` : "Ongoing"}
                  <span className="t-caption block !text-[0.8125rem]">{interval(t.intervalDaysMin, t.intervalDaysMax)}</span>
                </td>
                <td className="hidden py-4 pr-4 text-[0.875rem] text-text-2 lg:table-cell">{t.concerns.map(concernLabel).join(", ")}</td>
                <td className="py-4 text-right font-display text-[1.625rem] font-light text-ink">{formatPrice(t.priceCents)}</td>
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
                  <p className="text-[0.9375rem] text-ink">{p.name}</p>
                  <p className="t-caption mt-0.5 max-w-md !text-[0.8125rem]">{p.description}</p>
                </td>
                <td className="hidden py-4 pr-4 text-[0.875rem] text-text-2 lg:table-cell">{p.concerns.map(concernLabel).join(", ")}</td>
                <td className="py-4 text-right font-display text-[1.375rem] font-light text-ink tabular-nums">{formatPrice(p.priceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------- Brand ---------- */}
      <section id="brand" aria-labelledby="brand-title" className="glass focus-in mt-6 scroll-mt-28 p-6 sm:p-8">
        <h2 id="brand-title" className="font-display text-[2.125rem] font-light text-ink">
          Brand
        </h2>
        <p className="t-caption mt-1 !text-[0.8125rem]">
          What clients see on their scan and report: your name, logo and accent. Rebloom is one small line at the foot of
          the page.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <ClientPagePreview clinic={clinic} className="!px-8 !pb-8 !pt-7" />
          <dl className="rounded-[16px] bg-white/70 p-6 ring-1 ring-inset ring-white">
            {[
              ["Name", clinic.name],
              ["Wordmark", clinic.wordmark],
              ["Accent", clinic.accentHex.toUpperCase()],
            ].map(([term, value]) => (
              <div key={term} className="flex items-baseline justify-between gap-4 border-b border-[#0c1a22]/[0.06] py-3 last:border-0">
                <dt className="t-label !text-[0.75rem]">{term}</dt>
                <dd className="flex items-center gap-2 text-[0.875rem] text-ink">
                  {term === "Accent" && <span aria-hidden className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: clinic.accentHex }} />}
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- Booking (DECISIONS D-065, D-066) ---------- */}
      <section id="booking" aria-labelledby="booking-title" className="glass focus-in mt-6 scroll-mt-28 p-6 sm:p-8">
        <h2 id="booking-title" className="font-display text-[2.125rem] font-light text-ink">
          Booking
        </h2>
        <p className="t-caption mt-1 !text-[0.8125rem]">How clients book from their report. Times come from your hours and the menu.</p>
        <div className="mt-6 rounded-[16px] bg-white/70 p-6 ring-1 ring-inset ring-white">
          <DepositSwitch initial={settings.depositRequired} amount={formatPrice(clinic.depositCents)} />
          {settings.depositRequired && !env.STRIPE_SECRET_KEY && (
            <p className="t-caption -mt-1 !text-[0.8125rem] text-[#7a4210]">Stripe isn&apos;t connected yet, so no deposit is taken until it is.</p>
          )}
        </div>
        <dl className="mt-4">
          {[
            ["Hours", hoursText(clinic.hours)],
            ["Times", `Every ${clinic.hours.slotMinutes} minutes, one treatment room`],
            ["Cancelling", `Online, up to ${NOTICE_HOURS} hours before. After that, clients call you.`],
          ].map(([term, value]) => (
            <div key={term} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[#0c1a22]/[0.06] py-3.5 last:border-0">
              <dt className="t-label !text-[0.75rem]">{term}</dt>
              <dd className="text-[0.875rem] text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- Replies (DECISIONS D-087) ---------- */}
      <section id="replies" aria-labelledby="replies-title" className="glass focus-in mt-6 scroll-mt-28 p-6 sm:p-8">
        <h2 id="replies-title" className="font-display text-[2.125rem] font-light text-ink">
          Replies
        </h2>
        <p className="t-caption mt-1 max-w-2xl !text-[0.8125rem]">
          When a client writes back, hear about it straight away, with their words and a link to answer. A few lines in a row
          send one alert.
        </p>
        <div className="mt-6 rounded-[16px] bg-white/70 p-6 ring-1 ring-inset ring-white">
          <ReplyAlerts email={settings.alertEmail} phone={settings.alertPhone ? formatUsPhone(settings.alertPhone) : null} textsLive={features.sms} />
          {!features.email && <p className="t-caption mt-1 !text-[0.8125rem] text-[#7a4210]">Email isn&apos;t connected yet, so alerts can&apos;t be emailed until it is.</p>}
        </div>
        {env.DEMO_MODE && (
          <p className="t-caption mt-4 !text-[0.8125rem]">
            Demo: alerts cover this browser&apos;s clients, including replies to the copies you send yourself.
          </p>
        )}
      </section>

      {/* ---------- Connects to ---------- */}
      <section id="connects" aria-labelledby="connects-title" className="glass focus-in mt-6 scroll-mt-28 p-6 sm:p-8">
        <h2 id="connects-title" className="font-display text-[2.125rem] font-light text-ink">
          Connects to
        </h2>
        <ul className="mt-5">
          <li className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#0c1a22]/[0.06] py-4">
            <span>
              <span className="text-[0.9375rem] text-ink">Stripe</span>
              <span className="t-caption ml-3 !text-[0.8125rem]">Deposits at booking</span>
            </span>
            <span className="text-[0.8125rem] text-text-2">{env.STRIPE_SECRET_KEY ? "Connected · Test mode" : "Test mode · Not connected yet"}</span>
          </li>
          <li className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#0c1a22]/[0.06] py-4">
            <span>
              <span className="text-[0.9375rem] text-ink">Email</span>
              <span className="t-caption ml-3 !text-[0.8125rem]">Reports and rebook messages</span>
            </span>
            <span className="text-[0.8125rem] text-text-2">
              {env.DEMO_MODE ? "Demo mode · Logged, not sent" : features.email ? "Connected" : "Not connected yet"}
            </span>
          </li>
        </ul>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTS_TO.map(([name, what]) => (
            <li key={name} className="lift sheen relative rounded-[16px] bg-white/70 p-6 ring-1 ring-inset ring-white shadow-[0_16px_32px_-24px_rgba(12,44,62,0.4)]">
              <p className="text-[0.9375rem] text-ink">{name}</p>
              <p className="t-caption mt-1 !text-[0.8125rem]">{what}</p>
              <p className="mt-6 inline-flex rounded-full bg-[#9fc9dd]/30 px-2.5 py-1 text-[0.75rem] uppercase tracking-[0.14em] text-[#174a63]">Coming soon</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
