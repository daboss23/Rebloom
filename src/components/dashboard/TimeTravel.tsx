"use client";

import { useEffect, useState, useTransition } from "react";
import { travel, travelToOpening } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";

const STEPS = [
  { days: 1, label: "+1 day" },
  { days: 7, label: "+1 week" },
  { days: 30, label: "+1 month" },
];

export interface ClockReading {
  /** The sandbox's virtual now, as an ISO instant. */
  now: string;
  timeZone: string;
  /** How far the clock runs ahead, in minutes. */
  offsetMinutes: number;
}

/** Hours and minutes of an instant on the clinic's wall clock. */
function wall(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return { h: Number(parts.hour) % 24, m: Number(parts.minute) };
}

const timeLabel = (instant: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(instant).replace(" ", "").toLowerCase();

/** "+3 days", "+12h": how far ahead of real time the demo runs. */
function ahead(minutes: number): string | null {
  if (minutes < 60) return null;
  const days = Math.floor(minutes / 1440);
  return days >= 1 ? `+${days} ${days === 1 ? "day" : "days"}` : `+${Math.round(minutes / 60)}h`;
}

/**
 * The demo clock (brief 3.4: "time travel"). Moves this browser's clock forward so judges can watch
 * triggers fire. Never backwards (DECISIONS D-016). "Next opening" lands on the moment the clinic next opens (D-091).
 * Its face keeps the demo's time, and spins forward when the clock jumps.
 */
export function TimeTravel({ dateLabel, clock, compact }: { dateLabel: string; clock: ClockReading; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // The demo's time runs on with real time between jumps; a new reading from the server starts it afresh.
  const [served, setServed] = useState(clock.now);
  const [elapsed, setElapsed] = useState(0);
  if (served !== clock.now) {
    setServed(clock.now);
    setElapsed(0);
  }
  useEffect(() => {
    const since = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - since), 20_000);
    return () => clearInterval(t);
  }, [clock.now]);
  const now = new Date(Date.parse(clock.now) + elapsed);

  // Hands only ever turn forward: past twelve or the top of the hour they go on round, never back. A jump adds
  // whole turns, more for a longer jump, so time is seen to pass.
  const { h, m } = wall(now, clock.timeZone);
  const hourBase = (h % 12) * 30 + m * 0.5;
  const minuteBase = m * 6;
  const [dial, setDial] = useState({ offset: clock.offsetMinutes, hourBase, minuteBase, hourTurns: 0, minuteTurns: 0 });
  if (clock.offsetMinutes !== dial.offset || hourBase !== dial.hourBase || minuteBase !== dial.minuteBase) {
    const spins = clock.offsetMinutes > dial.offset ? Math.min(3, Math.ceil((clock.offsetMinutes - dial.offset) / 1440)) : 0;
    setDial({
      offset: clock.offsetMinutes,
      hourBase,
      minuteBase,
      hourTurns: dial.hourTurns + spins + (hourBase < dial.hourBase ? 1 : 0),
      minuteTurns: dial.minuteTurns + spins * 4 + (minuteBase < dial.minuteBase ? 1 : 0),
    });
  }
  const hourDeg = hourBase + dial.hourTurns * 360;
  const minuteDeg = minuteBase + dial.minuteTurns * 360;
  const run = (go: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await go();
      if (!result.ok) setError(result.error ?? "Couldn't move the clock.");
    });
  const lead = ahead(clock.offsetMinutes);

  return (
    <div className={cx("relative flex items-center gap-4", compact && "w-full flex-wrap justify-between gap-y-2.5")} aria-busy={pending}>
      <div className="flex items-center gap-3 leading-tight">
        {/* An ivory face in a gold bezel, keeping the demo's time. */}
        <span
          aria-hidden
          className="relative hidden h-9 w-9 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#f7f1e4_70%,#efe3c8_100%)] shadow-[inset_0_0_0_1.5px_#c99645,inset_0_0_0_3px_rgba(255,255,255,0.9),0_6px_14px_-8px_rgba(154,107,34,0.6)] sm:block"
        >
          {[0, 90, 180, 270].map((d) => (
            <span key={d} className="absolute left-1/2 top-1/2 h-[3px] w-px bg-[#b0802c]/70" style={{ transform: `translate(-50%, -50%) rotate(${d}deg) translateY(-12px)` }} />
          ))}
          <span
            className="clock-hand absolute bottom-1/2 left-1/2 h-[9px] w-[2px] -translate-x-1/2 rounded-full bg-[#0c1a22]"
            style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }}
          />
          <span
            className="clock-hand absolute bottom-1/2 left-1/2 h-[12px] w-px -translate-x-1/2 rounded-full bg-[#9a6b22]"
            style={{ transform: `translateX(-50%) rotate(${minuteDeg}deg)` }}
          />
          <span className="absolute left-1/2 top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[linear-gradient(135deg,#f1d49a,#b98a3c)]" />
        </span>
        <span>
          <span className="flex items-center gap-2">
            <span className="t-label whitespace-nowrap !text-[0.75rem]">Demo clock</span>
            {lead && (
              <span className="rounded-full bg-[#e2c07a]/25 px-1.5 text-[0.75rem] font-medium tabular-nums text-[#7a5014] ring-1 ring-inset ring-[#c99645]/30">{lead}</span>
            )}
          </span>
          <span key={dateLabel} className="clock-flash focus-in block whitespace-nowrap text-[0.875rem] text-ink tabular-nums">
            {dateLabel} <span className="text-text-3">· {timeLabel(now, clock.timeZone)}</span>
          </span>
        </span>
      </div>
      <div
        role="group"
        aria-label="Move the demo clock forward"
        className={cx(
          "flex overflow-hidden rounded-[13px] bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(255,255,255,0.6))] p-1 shadow-[inset_0_1px_0_#fff,0_10px_24px_-16px_rgba(12,44,62,0.45)] ring-1 ring-inset ring-[#0c1a22]/[0.07] backdrop-blur",
          compact && "w-full",
        )}
      >
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => travelToOpening())}
          className={cx(
            "h-8 whitespace-nowrap rounded-[9px] px-3 text-[0.8125rem] font-medium text-[#5a3a08] transition-[filter,transform] duration-150 ease-out",
            "bg-[linear-gradient(180deg,#fff4dc,#f1d49a)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_0_1px_rgba(201,150,69,0.4)] hover:brightness-105 active:scale-[0.96] disabled:opacity-50",
            compact && "flex-1",
          )}
        >
          Next opening
        </button>
        {STEPS.map((step) => (
          <button
            key={step.days}
            type="button"
            disabled={pending}
            onClick={() => run(() => travel(step.days))}
            className={cx(
              "h-8 whitespace-nowrap rounded-[9px] px-2.5 text-[0.8125rem] text-text-2 transition-[background-color,color,transform] duration-150 ease-out sm:px-3",
              "hover:bg-white hover:text-ink hover:shadow-[0_4px_10px_-6px_rgba(12,44,62,0.4)] active:scale-[0.96] disabled:opacity-50",
              compact && "flex-1",
            )}
          >
            {step.label}
          </button>
        ))}
      </div>
      <p role="status" className="sr-only">
        {pending ? "Moving the clock forward" : error ?? ""}
      </p>
      {/* Below the bar, so a message never squeezes the controls. */}
      {error && (
        <p className="sea on-dark absolute right-0 top-full z-40 mt-2 w-max max-w-[20rem] rounded-[12px] px-4 py-2.5 text-[0.8125rem] leading-snug shadow-[0_18px_36px_-18px_rgba(12,26,34,0.7)]">
          {error}
        </p>
      )}
    </div>
  );
}
