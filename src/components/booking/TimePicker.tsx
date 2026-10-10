"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bookTime } from "@/app/r/[token]/book/actions";
import { Chip } from "@/components/ui/Chip";
import { FormAlert } from "@/components/ui/FormAlert";
import { cx } from "@/components/ui/cx";
import type { OpenDay } from "@/lib/booking/slots";

// Days and times for one visit (DECISIONS D-065). A day, then a time, then one gold action pinned at the foot of
// the screen with the choice written out, as the questionnaire pins its Continue.

const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);
const part = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(noon(iso));
/** "10:30" to "10:30 AM". */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

export function TimePicker({ token, days, depositCents }: { token: string; days: OpenDay[]; depositCents: number }) {
  const router = useRouter();
  const [date, setDate] = useState(days[0]?.date ?? null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const day = days.find((d) => d.date === date) ?? days[0];
  const chosen = day?.slots.find((s) => s.startsAt === startsAt) ?? null;
  const groups = [
    { label: "Morning", slots: day?.slots.filter((s) => s.time < "12:00") ?? [] },
    { label: "Afternoon", slots: day?.slots.filter((s) => s.time >= "12:00") ?? [] },
  ].filter((g) => g.slots.length > 0);

  const book = () => {
    if (!startsAt) return;
    setError(null);
    start(async () => {
      const result = await bookTime({ token, startsAt });
      // Success leaves the page: to Stripe, or to the confirmation. Only a refusal comes back.
      if (!result.ok) {
        setError(result.error ?? "That didn't go through. Please try again.");
        setStartsAt(null);
        router.refresh();
      }
    });
  };

  return (
    <div>
      <h2 className="t-label mt-10 text-text-2" id="days-label">
        Choose a day
      </h2>
      {/* Phones: bleeds to the screen's edges, so the next days peek in and say "swipe". Wider: wraps, so a mouse reaches every day. */}
      <ul aria-labelledby="days-label" className="-mx-5 -mb-4 mt-2 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-5 px-5 pb-7 pt-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {days.map((d) => {
          const selected = d.date === day?.date;
          return (
            <li key={d.date} className="snap-start">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${part(d.date, { weekday: "long", month: "long", day: "numeric" })}, ${d.slots.length} ${d.slots.length === 1 ? "time" : "times"} open`}
                onClick={() => {
                  setDate(d.date);
                  setStartsAt(null);
                  setError(null);
                }}
                className={cx(
                  "flex h-[96px] w-[70px] flex-col items-center justify-center rounded-[16px] border transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.97]",
                  selected
                    ? "border-transparent bg-[linear-gradient(180deg,#23668a_0%,#134560_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_14px_26px_-14px_rgba(19,69,96,0.8)]"
                    : "border-[#0c1a22]/[0.12] bg-white/65 text-ink hover:border-[#0c1a22]/25 hover:bg-white/90",
                )}
              >
                <span className={cx("text-[0.6875rem] uppercase tracking-[0.16em]", selected ? "text-white/80" : "text-text-3")}>
                  {part(d.date, { weekday: "short" })}
                </span>
                <span className="font-display text-[2rem] font-light leading-[1.1]">{part(d.date, { day: "numeric" })}</span>
                <span className={cx("text-[0.6875rem] uppercase tracking-[0.16em]", selected ? "text-white/80" : "text-text-3")}>
                  {part(d.date, { month: "short" })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {day && (
        <section aria-labelledby="times-label" className="mt-8">
          <h2 id="times-label" className="t-label text-text-2">
            Times on {part(day.date, { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          {groups.map((g) => (
            <div key={g.label} className="mt-5">
              <p className="t-caption text-text-2">{g.label}</p>
              <ul aria-label={`${g.label} times`} className="mt-2.5 grid grid-cols-3 gap-2 max-[359px]:grid-cols-2 sm:grid-cols-4">
                {g.slots.map((s) => (
                  <li key={s.startsAt}>
                    <Chip
                      selected={s.startsAt === startsAt}
                      onClick={() => {
                        setStartsAt(s.startsAt);
                        setError(null);
                      }}
                      className="w-full justify-center tabular-nums"
                    >
                      {clock(s.time)}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <div className="sticky bottom-0 z-10 -mx-5 mt-10 bg-[linear-gradient(180deg,rgba(237,243,246,0)_0%,rgba(237,243,246,0.97)_22%,#edf3f6_34%)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-12">
        {error && (
          <div className="mb-3">
            <FormAlert>{error}</FormAlert>
          </div>
        )}
        <p aria-live="polite" className="mb-3 min-h-[1.5em] text-center text-[0.875rem] text-text-2">
          {chosen && day ? (
            <>
              <span className="text-ink">
                {part(day.date, { weekday: "short", month: "short", day: "numeric" }).replace(",", "")} · {clock(chosen.time)}
              </span>
              {depositCents > 0 && <span> · {dollars(depositCents)} deposit</span>}
            </>
          ) : (
            "Choose a time to book it."
          )}
        </p>
        <button type="button" onClick={book} disabled={!chosen || pending} className="btn-gold !h-14 w-full text-[1rem] disabled:opacity-55">
          {pending ? (depositCents > 0 ? "Opening secure payment" : "Booking") : depositCents > 0 ? `Pay ${dollars(depositCents)} deposit and book` : "Book this time"}
        </button>
      </div>
    </div>
  );
}
