import Link from "next/link";
import { Queue } from "@/components/dashboard/Queue";
import { toQueueRow } from "@/components/dashboard/queue-row";
import { Visits } from "@/components/dashboard/Visits";
import { IconArrowRight } from "@/components/ui/Icons";
import { loadBook } from "@/lib/dashboard/load";
import { fullName, visitsOn } from "@/lib/dashboard/view";
import { env } from "@/lib/env";
import { formatPrice, nextOpenDay, shiftDate } from "@/lib/plan/build";
import { TRIGGER_LABEL } from "@/lib/rebook/engine";

function greeting(now: Date, timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** Today: who should we contact, and why. Everything else supports that. */
export default async function TodayPage() {
  const book = await loadBook();
  const { clinic, queue, facts, today, now } = book;
  const byId = new Map(facts.map((f) => [f.client.id, f]));
  const rows = queue.items.map((item) => toQueueRow(item, byId.get(item.clientId)!));
  const visits = visitsOn(today, facts, book.input.treatments, clinic.timezone);
  const ready = queue.items.reduce((n, i) => n + (i.valueCents ?? 0), 0);
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${today}T12:00:00Z`),
  );
  const open = Boolean(clinic.hours.days[new Date(`${today}T12:00:00Z`).getUTCDay() as 0]);
  const nextOpen = nextOpenDay(shiftDate(today, 1), clinic.hours);
  const recent = queue.handled.slice(0, 4);

  const people = rows.length;
  const figures: [string, string][] = [
    [String(people), people === 1 ? "person to contact" : "people to contact"],
    [String(visits.length), visits.length === 1 ? "visit today" : "visits today"],
    [formatPrice(ready), "ready to rebook"],
  ];

  return (
    <div>
      <header className="reveal">
        <p className="t-label">{date}</p>
        <h1 className="mt-4 font-display text-[22px] font-light text-text-2">
          {greeting(now, clinic.timezone)}, {book.staff.name}.
        </h1>
        <p className="mt-4 grid gap-y-1 font-display font-light text-ink lining-nums sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-5">
          {figures.map(([figure, words], i) => (
            <span key={words} className="inline-flex items-baseline gap-x-5">
              {i > 0 && (
                <span aria-hidden className="hidden text-[28px] text-sage sm:inline">
                  ·
                </span>
              )}
              <span className="inline-flex items-baseline gap-2.5">
                <span className="text-[clamp(44px,6vw,68px)] leading-[1.05] tracking-[-0.02em] tabular-nums">{figure}</span>
                <span className="text-[clamp(20px,2.2vw,26px)] text-text-2">{words}</span>
              </span>
            </span>
          ))}
        </p>
      </header>

      <div className="mt-16 grid gap-x-14 gap-y-16 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <section aria-labelledby="contact">
          <div className="mb-5 flex items-baseline justify-between gap-6">
            <h2 id="contact" className="font-display text-[30px] font-light text-ink">
              Who to contact, and why
            </h2>
            <Link href="/dashboard/rebook" className="group hidden items-center gap-2 text-[13.5px] text-text-3 hover:text-ink sm:inline-flex">
              Outbox and history
              <IconArrowRight width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
          <Queue rows={rows} demo={env.DEMO_MODE} empty="Nobody needs a message today. Move the clock forward to see who will." />

          {recent.length > 0 && (
            <div className="mt-12">
              <h3 className="t-label">Done</h3>
              <ul className="mt-3">
                {recent.map(({ item, message }) => (
                  <li key={message.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-mist py-3 text-[14px]">
                    <span className="text-text-2">
                      <span className="text-ink">{fullName(byId.get(item.clientId)!.client)}</span> · {TRIGGER_LABEL[item.kind]}
                    </span>
                    <span className="t-caption !text-[12.5px]">{message.status === "sent" ? `Email sent: ${message.subject}` : message.body}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside aria-labelledby="visits" className="xl:pt-[3.1rem]">
          <h2 id="visits" className="t-label">
            Today&apos;s visits
          </h2>
          <div className="mt-3">
            <Visits
              visits={visits}
              now={now}
              empty={
                open
                  ? "No visits booked today."
                  : `The clinic is closed today. Next open ${new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${nextOpen}T12:00:00Z`))}.`
              }
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
