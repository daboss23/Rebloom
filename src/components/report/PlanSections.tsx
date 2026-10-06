import { Bloom } from "@/components/dashboard/Bloom";
import { LightField } from "@/components/dashboard/LightField";
import { IconArrowRight, IconPhone } from "@/components/ui/Icons";
import type { BudgetBand, Clinic } from "@/lib/domain";
import { formatShortDay } from "@/lib/clock";
import { BUDGET_OPTIONS, EVENT_OPTIONS } from "@/lib/flow/intake-options";
import { formatPrice, type Plan, type PlanOption, type TimelineStep } from "@/lib/plan/build";
import type { Intake } from "@/lib/domain";

// Plan dates are "YYYY-MM-DD". Formatted at UTC noon so no time zone moves them a day.
const shortDay = (iso: string) => formatShortDay(`${iso}T12:00:00Z`, "UTC").toUpperCase();
const longDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function eventName(intake: Intake | null): string {
  if (!intake?.eventType || intake.eventType === "other") return "Your event";
  return `Your ${(EVENT_OPTIONS.find(([v]) => v === intake.eventType)?.[1] ?? "event").toLowerCase()}`;
}

function stepText(step: TimelineStep, steps: TimelineStep[], clinic: Clinic, intake: Intake | null): { title: string; detail: string } {
  if (step.kind === "session") {
    const t = step.treatment;
    const settle = t.downtimeDays > 0 ? ` · allow ${plural(t.downtimeDays, "day")} to settle` : "";
    return {
      title: step.first ? `Consultation and ${t.name}` : t.name,
      detail: `Session ${step.session} of ${step.of} · ${t.durationMinutes} min · ${clinic.city}${settle}`,
    };
  }
  if (step.kind === "progress") return { title: "Progress scan", detail: "From home, two minutes. See what's changed." };
  const sessions = steps.filter((s) => s.kind === "session");
  const rest = sessions.length > 0 ? daysBetween(sessions[sessions.length - 1].date, step.date) : 0;
  return {
    title: eventName(intake),
    detail:
      rest > 8 * 7
        ? "Your course finishes well ahead of the day"
        : rest >= 14
          ? `${plural(Math.floor(rest / 7), "week")} of rest built in`
          : `${plural(rest, "day")} of rest built in`,
  };
}

export function PlanTimeline({
  plan,
  rationale,
  clinic,
  intake,
}: {
  plan: Plan;
  rationale: string;
  clinic: Clinic;
  intake: Intake | null;
}) {
  const event = plan.timeline.find((s) => s.kind === "event");
  return (
    <section className="mt-16" aria-labelledby="plan-heading">
      <h2 id="plan-heading" className="t-h2">
        {event ? `Your path to ${longDay(event.date)}` : "Your path"}
      </h2>
      <p className="t-body mt-3">{rationale}</p>
      {plan.shortenedForEvent && (
        <p className="t-caption mt-2">Your date is close, so we&apos;ve planned only the sessions that fit safely before it.</p>
      )}
      {/* The first visit in gold (it's the one to book), progress scans in ice, the day itself in bloom. */}
      <ol className="glass relative mt-7 px-5 pb-1 pt-6">
        {plan.timeline.map((step, i) => {
          const { title, detail } = stepText(step, plan.timeline, clinic, intake);
          const last = i === plan.timeline.length - 1;
          return (
            <li key={`${step.kind}-${step.date}`} className="relative pb-7 pl-9">
              {!last && <span aria-hidden className="absolute bottom-0 left-[7px] top-5 w-px bg-[linear-gradient(180deg,#9fc9dd,rgba(159,201,221,0.25))]" />}
              {step.kind === "event" ? (
                <Bloom size={16} className="absolute left-0 top-[2px] text-[#9e4a5d]" />
              ) : (
                <span
                  aria-hidden
                  className={
                    i === 0
                      ? "absolute left-0 top-[3px] h-[15px] w-[15px] rounded-full bg-[linear-gradient(135deg,#f1d49a,#c99645)] shadow-[0_4px_10px_-4px_rgba(201,150,69,0.9)] ring-2 ring-white"
                      : step.kind === "progress"
                        ? "absolute left-[2px] top-[5px] h-[11px] w-[11px] rounded-full bg-[#9fc9dd] ring-2 ring-white"
                        : "absolute left-[2px] top-[5px] h-[11px] w-[11px] rounded-full border-2 border-[#1e5a78] bg-white"
                  }
                />
              )}
              <p className="t-label">{shortDay(step.date)}</p>
              <p className="mt-1 text-[16px] text-ink">{title}</p>
              <p className="t-caption mt-0.5">{detail}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Lines({ option }: { option: PlanOption }) {
  return (
    <>
      {option.lines.map((l) => (
        <div key={l.treatment.id} className="flex items-baseline justify-between gap-4 border-t border-[#0c1a22]/[0.07] py-3 text-[14.5px] first:border-t-0">
          <span className="text-text-2">
            {l.treatment.name} · {l.sessions === 1 ? "1 session" : `${l.sessions} sessions`}
          </span>
          <span className="text-ink tabular-nums">{formatPrice(l.totalCents)}</span>
        </div>
      ))}
    </>
  );
}

export function Investment({ plan, budgetBand }: { plan: Plan; budgetBand: BudgetBand | null }) {
  const band = BUDGET_OPTIONS.find(([v]) => v === budgetBand)?.[1];
  return (
    <section className="mt-16" aria-labelledby="investment-heading">
      <h2 id="investment-heading" className="t-h2">
        Your investment
      </h2>
      <div className="glass mt-6 px-5 pb-5 pt-2">
        <Lines option={plan.recommended} />
        <div className="flex items-baseline justify-between border-t border-[#0c1a22]/[0.07] py-3 text-[14.5px]">
          <span className="text-text-2">Progress scans</span>
          <span className="text-text-3">Included</span>
        </div>
        <div className="flex items-end justify-between border-t border-[#0c1a22]/20 pt-4">
          <span className="text-[15px] text-ink">Estimated total</span>
          <span className="gold-foil font-display text-[44px] font-light leading-none tabular-nums">
            {formatPrice(plan.recommended.totalCents)}
          </span>
        </div>
      </div>

      {plan.withinBudget && (
        <div className="mt-3 rounded-[18px] bg-white/45 px-5 py-5 ring-1 ring-inset ring-[#0c1a22]/[0.07]">
          <p className="t-label">Closer to your budget</p>
          <p className="t-body mt-2">
            {band ? `You told us ${band.toLowerCase()}. ` : ""}A lighter start that still begins where your skin needs it
            most:
          </p>
          <div className="mt-3">
            <Lines option={plan.withinBudget} />
            <div className="flex items-baseline justify-between border-t border-[#0c1a22]/[0.12] pt-3 text-[14.5px]">
              <span className="text-ink">Total</span>
              <span className="gold-foil font-display text-[26px] leading-none tabular-nums">{formatPrice(plan.withinBudget.totalCents)}</span>
            </div>
          </div>
        </div>
      )}
      <p className="t-caption mt-4">Prices are per session from our menu. Your practitioner confirms the plan with you.</p>
    </section>
  );
}

export function HomeCare({ plan }: { plan: Plan }) {
  if (plan.homeCare.length === 0) return null;
  return (
    <section className="mt-16" aria-labelledby="homecare-heading">
      <h2 id="homecare-heading" className="t-h2">
        Between sessions
      </h2>
      <ul className="glass mt-6 divide-y divide-[#0c1a22]/[0.07] px-5">
        {plan.homeCare.map(({ product, reason }) => (
          <li key={product.id} className="flex items-start gap-4 py-4">
            <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-[linear-gradient(150deg,#ffffff_0%,#dcebf2_60%,#bcd9e7_100%)] font-display text-[22px] text-[#1e5a78] ring-1 ring-inset ring-white">
              {product.name[0]}
            </span>
            <span className="flex-1">
              <span className="block text-[15px] text-ink">{product.name}</span>
              <span className="t-caption mt-0.5 block">{reason}</span>
            </span>
            <span className="gold-foil font-display text-[22px] leading-none tabular-nums">{formatPrice(product.priceCents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "(310) 555-0142" to "+13105550142" for tel: and sms: links. */
function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

export function ReadyWhenYouAre({ plan, clinic }: { plan: Plan; clinic: Clinic }) {
  const first = plan.timeline.find((s) => s.kind === "session");
  return (
    <section className="sea on-dark relative mt-16 overflow-hidden rounded-[28px] px-6 py-10 shadow-[0_40px_80px_-44px_rgba(12,26,34,0.65)]">
      <LightField variant="sea" className="opacity-70" />
      <div className="relative">
        <h2 className="font-display text-[36px] font-light leading-[1.05] text-white">Ready when you are.</h2>
        {first && (
          <p className="mt-3 text-[15px] leading-relaxed text-[#dbe8ef]">
            Suggested first visit · {formatShortDay(`${first.date}T12:00:00Z`, "UTC")} · {clinic.city}
          </p>
        )}
        <a
          href={`tel:${dialable(clinic.phone)}`}
          className="btn-gold group mt-7 !h-14 w-full gap-2.5 px-6 text-[16px]"
        >
          <IconPhone aria-hidden width={18} height={18} />
          Call to book your first session
        </a>
        <a
          href={`sms:${dialable(clinic.phone)}`}
          className="group mt-3 flex min-h-11 items-center justify-center gap-2 text-[14px] text-white/90 underline decoration-white/30 underline-offset-4 transition-colors duration-200 hover:text-white hover:decoration-white/70"
        >
          Questions? Text the clinic
          <IconArrowRight aria-hidden width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </a>
      </div>
    </section>
  );
}
