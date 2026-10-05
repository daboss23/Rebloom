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
      <ol className="mt-8 relative">
        {plan.timeline.map((step, i) => {
          const { title, detail } = stepText(step, plan.timeline, clinic, intake);
          const last = i === plan.timeline.length - 1;
          return (
            <li key={`${step.kind}-${step.date}`} className="relative pl-8 pb-7">
              {!last && <span aria-hidden className="absolute left-[5px] top-3 bottom-0 w-px bg-mist" />}
              <span
                aria-hidden
                className={`absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border border-ink ${i === 0 ? "bg-ink" : "bg-porcelain"}`}
              />
              <p className="t-label">{shortDay(step.date)}</p>
              <p className="t-h3 mt-1">{title}</p>
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
        <div key={l.treatment.id} className="flex items-baseline justify-between gap-4 border-t border-mist py-3 text-[14px]">
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
      <div className="mt-6">
        <Lines option={plan.recommended} />
        <div className="flex items-baseline justify-between border-t border-mist py-3 text-[14px]">
          <span className="text-text-2">Progress scans</span>
          <span className="text-text-3">Included</span>
        </div>
        <div className="flex items-end justify-between border-t border-ink pt-4">
          <span className="text-[15px] text-ink">Estimated total</span>
          <span className="font-display font-light text-[40px] leading-none text-ink tabular-nums">
            {formatPrice(plan.recommended.totalCents)}
          </span>
        </div>
      </div>

      {plan.withinBudget && (
        <div className="mt-8 border border-mist px-4 py-5">
          <p className="t-label">Closer to your budget</p>
          <p className="t-body mt-2">
            {band ? `You told us ${band.toLowerCase()}. ` : ""}A lighter start that still begins where your skin needs it
            most:
          </p>
          <div className="mt-3">
            <Lines option={plan.withinBudget} />
            <div className="flex items-baseline justify-between border-t border-mist pt-3 text-[14px]">
              <span className="text-ink">Total</span>
              <span className="text-ink tabular-nums">{formatPrice(plan.withinBudget.totalCents)}</span>
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
      <ul className="mt-6">
        {plan.homeCare.map(({ product, reason }) => (
          <li key={product.id} className="flex items-start gap-4 border-t border-mist py-4">
            <span aria-hidden className="h-14 w-14 shrink-0 bg-mist" />
            <span className="flex-1">
              <span className="block text-[15px] text-ink">{product.name}</span>
              <span className="block t-caption mt-0.5">{reason}</span>
            </span>
            <span className="text-[14px] text-ink tabular-nums">{formatPrice(product.priceCents)}</span>
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
    <section className="mt-16 bg-ink on-dark px-6 py-10">
      <h2 className="font-display font-light text-[30px] leading-tight text-porcelain">Ready when you are.</h2>
      {first && (
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Suggested first visit · {formatShortDay(`${first.date}T12:00:00Z`, "UTC")} · {clinic.city}
        </p>
      )}
      <a
        href={`tel:${dialable(clinic.phone)}`}
        className="mt-6 flex min-h-12 w-full items-center justify-center bg-accent px-6 text-[15px] text-on-accent hover:opacity-90"
      >
        Call to book your first session
      </a>
      <a
        href={`sms:${dialable(clinic.phone)}`}
        className="mt-3 flex min-h-11 items-center justify-center text-[14px] text-porcelain underline underline-offset-4"
      >
        Questions? Text the clinic
      </a>
    </section>
  );
}
