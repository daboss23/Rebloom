import Link from "next/link";
import { Bloom } from "@/components/dashboard/Bloom";
import { CountUp } from "@/components/dashboard/CountUp";
import { LightField } from "@/components/dashboard/LightField";
import { Queue } from "@/components/dashboard/Queue";
import { toQueueRow } from "@/components/dashboard/queue-row";
import { Visits } from "@/components/dashboard/Visits";
import { IconArrowRight } from "@/components/ui/Icons";
import { loadBook } from "@/lib/dashboard/load";
import { fullName, visitsOn } from "@/lib/dashboard/view";
import { env, features } from "@/lib/env";
import { nextOpenDay, shiftDate } from "@/lib/plan/build";
import { TRIGGER_LABEL } from "@/lib/rebook/engine";

function greeting(now: Date, timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** "Grace", "Grace and Daniel", "Grace, Daniel and Chloe". */
const names = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

/** Today: who should we contact, and why. Everything else supports that. */
export default async function TodayPage() {
  const book = await loadBook();
  const { clinic, queue, facts, today, now } = book;
  const byId = new Map(facts.map((f) => [f.client.id, f]));
  const rows = queue.items.map((item) => toQueueRow(item, byId.get(item.clientId)!, clinic.name));
  const visits = visitsOn(today, facts, book.input.treatments, clinic.timezone);
  const ready = queue.items.reduce((n, i) => n + (i.valueCents ?? 0), 0);
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${today}T12:00:00Z`),
  );
  const open = Boolean(clinic.hours.days[new Date(`${today}T12:00:00Z`).getUTCDay() as 0]);
  const nextOpen = nextOpenDay(shiftDate(today, 1), clinic.hours);
  const recent = queue.handled.slice(0, 4);

  // One line that reads the queue back in words: the best moment first, then who needs care.
  const first = (id: string) => byId.get(id)!.client.firstName!;
  const moment = queue.items.find((i) => i.kind === "progress_moment");
  const risk = queue.items.filter((i) => i.atRisk).map((i) => first(i.clientId));
  const story = [
    moment ? `${first(moment.clientId)}'s skin is coming into bloom, with real change since the first scan. The perfect moment to rebook.` : null,
    risk.length ? `${names(risk.slice(0, 3))} ${risk.length === 1 ? "needs" : "need"} a little care.` : null,
  ]
    .filter(Boolean)
    .join(" ") || (rows.length ? "Everyone below has a reason to hear from you today." : "A calm day. Nobody is waiting on you.");

  const people = rows.length;
  const figures = [
    { value: people, words: people === 1 ? "person to contact" : "people to contact", gold: false },
    { value: visits.length, words: visits.length === 1 ? "visit today" : "visits today", gold: false },
    { value: Math.round(ready / 100), words: "ready to rebook", gold: true },
  ];

  return (
    <div>
      {/* ---------- The morning, in one glance ---------- */}
      <section className="focus-in relative overflow-hidden rounded-[28px] shadow-[0_40px_80px_-48px_rgba(12,44,62,0.55)] ring-1 ring-white/80">
        <LightField variant="ice" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(246,251,253,0.72)_0%,rgba(246,251,253,0.2)_48%,rgba(246,251,253,0)_75%)]" />
        <div className="relative px-6 pb-6 pt-10 sm:px-10 sm:pt-14 lg:px-12">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#1e5a78]">{date}</p>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(46px,6.4vw,88px)] font-light leading-[0.95] tracking-[-0.025em] text-ink">
            {greeting(now, clinic.timezone)}, {book.staff.name}.
          </h1>
          <p className="mt-5 flex max-w-xl gap-3 text-[17px] leading-relaxed text-text-2">
            {moment && <Bloom size={22} unfurl className="mt-0.5 text-[#9e4a5d]" />}
            <span>{story}</span>
          </p>

          <ul className="mt-10 grid gap-px overflow-hidden rounded-[20px] bg-white/60 ring-1 ring-white/80 backdrop-blur-xl sm:grid-cols-3">
            {figures.map((f, i) => (
              <li key={f.words} className="flex items-baseline gap-3 bg-white/45 px-6 py-5">
                <span className={`font-display text-[clamp(44px,5vw,64px)] font-light leading-none tracking-[-0.02em] ${f.gold ? "gold-foil" : "text-ink"}`}>
                  <CountUp value={f.value} format={f.gold ? "money" : "int"} delay={250 + i * 120} />
                </span>
                <span className="whitespace-nowrap text-[15px] text-text-2">{f.words}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mt-12 grid gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-labelledby="contact">
          <div className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-text-3">The rebook queue</p>
              <h2 id="contact" className="mt-2 font-display text-[36px] font-light leading-none text-ink">
                Who to contact, and why
              </h2>
            </div>
            <Link href="/dashboard/rebook" className="group hidden items-center gap-2 text-[13.5px] text-text-3 hover:text-ink sm:inline-flex">
              Outbox and history
              <IconArrowRight width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
          <Queue rows={rows} demo={env.DEMO_MODE} realCopy={env.DEMO_MODE && features.email} empty="Nobody needs a message today. Move the clock forward to see who will." />
        </section>

        <aside aria-label="Today" className="space-y-6 xl:pt-[4.6rem]">
          <section aria-labelledby="visits" className="glass focus-in overflow-hidden" style={{ animationDelay: "160ms" }}>
            <div className="flex items-baseline justify-between px-6 pt-6">
              <h2 id="visits" className="font-display text-[24px] font-light text-ink">
                Today&apos;s visits
              </h2>
              <span className="text-[12px] text-text-3">{visits.length ? `${visits.length} booked` : ""}</span>
            </div>
            <Visits
              visits={visits}
              now={now}
              empty={
                open
                  ? "No visits booked today."
                  : `The clinic is closed today. Next open ${new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${nextOpen}T12:00:00Z`))}.`
              }
            />
          </section>

          {recent.length > 0 && (
            <section aria-labelledby="done" className="glass focus-in px-6 py-6">
              <h2 id="done" className="font-display text-[24px] font-light text-ink">
                Done
              </h2>
              <ul className="mt-3 space-y-3">
                {recent.map(({ item, message }) => (
                  <li key={message.id} className="text-[14px]">
                    <p className="text-ink">
                      {fullName(byId.get(item.clientId)!.client)} <span className="text-text-3">· {TRIGGER_LABEL[item.kind]}</span>
                    </p>
                    <p className="t-caption !text-[12.5px]">{message.status !== "sent" ? message.body : message.channel === "sms" ? `Texted: ${message.body}` : `Email sent: ${message.subject}`}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
