"use client";

import { useContext, useEffect, useState, useTransition } from "react";
import { travel, travelToDay, travelToOpening, type ActionResult } from "@/app/dashboard/actions";
import { IconArrowLeft, IconArrowRight, IconCalendar, IconClose } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { CloseSheet, useSheet } from "./useSheet";

/**
 * The demo clock (brief 3.4: "time travel"). Moves this browser's clock forward so judges can watch triggers fire.
 * Never backwards (DECISIONS D-016). "Next opening" lands on the moment the clinic next opens (D-091); the calendar
 * lands on the opening of the day picked. Small in the bar, a tap away in the menu.
 */

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

/** A day the calendar can send the clock to, and the instant the clinic opens that day. */
export interface OpeningDay {
  day: string;
  at: string;
}

interface ClockProps {
  dateLabel: string;
  clock: ClockReading;
  openings: OpeningDay[];
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

/** "2026-10-11": an instant's date on the clinic's calendar. */
const isoDay = (instant: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(instant);

/** Formats a calendar date ("2026-10-15") as itself, whatever the viewer's zone. */
const dayLabel = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** "+3 days", "+12h": how far ahead of real time the demo runs. */
function ahead(minutes: number): string | null {
  if (minutes < 60) return null;
  const days = Math.floor(minutes / 1440);
  return days >= 1 ? `+${days} ${days === 1 ? "day" : "days"}` : `+${Math.round(minutes / 60)}h`;
}

/**
 * The demo's time, running on with real time between jumps, and the angles of the face's hands. The hands only ever
 * turn forward: past twelve or the top of the hour they go on round, and a jump adds whole turns, so time is seen to pass.
 */
function useDemoTime(clock: ClockReading) {
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
  return { now, hourDeg: hourBase + dial.hourTurns * 360, minuteDeg: minuteBase + dial.minuteTurns * 360 };
}

/** An ivory face in a gold bezel, keeping the demo's time. */
function ClockFace({ hourDeg, minuteDeg }: { hourDeg: number; minuteDeg: number }) {
  return (
    <span
      aria-hidden
      className="relative block h-9 w-9 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#f7f1e4_70%,#efe3c8_100%)] shadow-[inset_0_0_0_1.5px_#c99645,inset_0_0_0_3px_rgba(255,255,255,0.9),0_6px_14px_-8px_rgba(154,107,34,0.6)]"
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
  );
}

/** The bar's clock: the face and the demo's date, opening the full clock as a sheet (phones) or a panel below it. */
export function DemoClockChip(props: ClockProps) {
  const { ref, open, show, hide, dialogProps } = useSheet();
  const { now, hourDeg, minuteDeg } = useDemoTime(props.clock);
  const tz = props.clock.timeZone;

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="-ml-1.5 flex h-11 items-center gap-2 rounded-full pl-1 pr-3 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-white/10 active:scale-[0.97]"
      >
        <ClockFace hourDeg={hourDeg} minuteDeg={minuteDeg} />
        <span className="leading-tight max-[359px]:sr-only">
          <span className="sr-only">Demo clock, </span>
          <span key={props.dateLabel} className="clock-flash block whitespace-nowrap text-[0.75rem] text-white tabular-nums">
            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(now)}
          </span>
          <span className="block whitespace-nowrap text-[0.75rem] text-[#a9bcc8] tabular-nums">{timeLabel(now, tz)}</span>
        </span>
      </button>

      <dialog
        {...dialogProps}
        aria-label="Demo clock"
        onClick={(e) => e.target === ref.current && hide()}
        className="clock-sheet fixed inset-x-0 bottom-0 top-auto m-0 max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[24px] border-0 bg-[#f4f8fa]/95 p-0 text-text-2 shadow-[0_-24px_60px_-28px_rgba(6,20,30,0.55)] backdrop-blur-2xl sm:bottom-auto sm:left-6 sm:right-auto sm:top-[72px] sm:w-[360px] sm:rounded-[20px] sm:shadow-[0_28px_60px_-28px_rgba(6,20,30,0.6)]"
      >
        <div className="relative max-h-[88dvh] overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
          <button
            type="button"
            onClick={hide}
            aria-label="Close"
            className="absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full text-text-3 transition-colors duration-150 hover:bg-white hover:text-ink"
          >
            <IconClose width={18} height={18} />
          </button>
          <ClockPanel {...props} tone="light" calendarOpen onJumped={hide} />
        </div>
      </dialog>
    </>
  );
}

/** The clock in the menu, on deep sea. A jump closes the menu on phones, so the page shows what changed. */
export function DemoClockCard(props: ClockProps) {
  const closeMenu = useContext(CloseSheet);
  return (
    <section aria-label="Demo clock" className="rounded-[16px] bg-white/[0.05] p-3 ring-1 ring-inset ring-white/10">
      <ClockPanel {...props} tone="dark" onJumped={closeMenu ?? undefined} />
    </section>
  );
}

const GOLD =
  "bg-[linear-gradient(180deg,#fff4dc,#f1d49a)] font-medium text-[#5a3a08] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_0_1px_rgba(201,150,69,0.4)] hover:brightness-105";

function ClockPanel({
  dateLabel,
  clock,
  openings,
  tone,
  calendarOpen = false,
  onJumped,
}: ClockProps & { tone: "light" | "dark"; calendarOpen?: boolean; onJumped?: () => void }) {
  const dark = tone === "dark";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [calendar, setCalendar] = useState(calendarOpen);
  const [picked, setPicked] = useState<string | null>(null);
  const { now, hourDeg, minuteDeg } = useDemoTime(clock);
  const lead = ahead(clock.offsetMinutes);

  const run = (go: () => Promise<ActionResult>) =>
    start(async () => {
      setError(null);
      const result = await go();
      if (!result.ok) {
        setError(result.error ?? "Couldn't move the clock.");
        return;
      }
      setPicked(null);
      onJumped?.();
    });

  const button = "h-10 whitespace-nowrap rounded-[10px] text-[0.8125rem] transition-[background-color,color,filter,transform] duration-150 ease-out active:scale-[0.97] disabled:opacity-50";
  const step = dark
    ? "bg-white/[0.06] text-[#dbe8ef] ring-1 ring-inset ring-white/10 hover:bg-white/[0.12] hover:text-white"
    : "bg-white/70 text-text-2 ring-1 ring-inset ring-[#0c1a22]/[0.07] hover:bg-white hover:text-ink";

  return (
    <div aria-busy={pending}>
      <div className={cx("flex items-center gap-3", !dark && "pr-10")}>
        <ClockFace hourDeg={hourDeg} minuteDeg={minuteDeg} />
        <p className="leading-tight">
          <span className="flex items-center gap-2">
            <span className={cx("t-label whitespace-nowrap", dark && "!text-[#a9bcc8]")}>Demo clock</span>
            {lead && (
              <span
                className={cx(
                  "rounded-full px-1.5 text-[0.75rem] font-medium tabular-nums ring-1 ring-inset",
                  dark ? "bg-[#e2c07a]/15 text-[#e2c07a] ring-[#e2c07a]/30" : "bg-[#e2c07a]/25 text-[#7a5014] ring-[#c99645]/30",
                )}
              >
                {lead}
              </span>
            )}
          </span>
          <span key={dateLabel} className={cx("clock-flash focus-in mt-0.5 block text-[0.875rem] tabular-nums", dark ? "text-white" : "text-ink")}>
            <span className="whitespace-nowrap">{dateLabel}</span>{" "}
            <span className={cx("whitespace-nowrap", dark ? "text-[#a9bcc8]" : "text-text-3")}>· {timeLabel(now, clock.timeZone)}</span>
          </span>
        </p>
      </div>

      <div role="group" aria-label="Move the demo clock forward" className="mt-4 grid grid-cols-3 gap-1.5">
        <button type="button" disabled={pending} onClick={() => run(travelToOpening)} className={cx(button, GOLD, "col-span-3")}>
          Next opening
        </button>
        {STEPS.map((s) => (
          <button key={s.days} type="button" disabled={pending} onClick={() => run(() => travel(s.days))} className={cx(button, step)}>
            {s.label}
          </button>
        ))}
      </div>

      {calendar ? (
        <Calendar
          openings={openings}
          now={now}
          timeZone={clock.timeZone}
          picked={picked}
          onPick={setPicked}
          onGo={(day) => run(() => travelToDay(day))}
          pending={pending}
          dark={dark}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCalendar(true)}
          className={cx(button, "mt-1.5 flex w-full items-center justify-center gap-2", dark ? "text-[#a9bcc8] hover:bg-white/[0.06] hover:text-white" : "text-text-2 hover:bg-white")}
        >
          <IconCalendar width={16} height={16} />
          Pick a date
        </button>
      )}

      <p role="status" className="sr-only">
        {pending ? "Moving the clock forward" : (error ?? "")}
      </p>
      {error && <p className={cx("mt-3 text-[0.8125rem] leading-snug", dark ? "text-[#f4b9a3]" : "text-[#9e4a5d]")}>{error}</p>}
    </div>
  );
}

/** A month at a time, from today to the last day the clock can reach. Open days are the only ones that take a tap. */
function Calendar({
  openings,
  now,
  timeZone,
  picked,
  onPick,
  onGo,
  pending,
  dark,
}: {
  openings: OpeningDay[];
  now: Date;
  timeZone: string;
  picked: string | null;
  onPick: (day: string) => void;
  onGo: (day: string) => void;
  pending: boolean;
  dark: boolean;
}) {
  const opens = new Map(openings.map((o) => [o.day, o.at]));
  const today = isoDay(now, timeZone);
  const first = today.slice(0, 7);
  const last = (openings.at(-1)?.day ?? today).slice(0, 7);
  const [month, setMonth] = useState(first);
  const shown = month < first ? first : month; // The demo's today can move past the month on screen.
  const [y, m] = shown.split("-").map(Number);
  const blanks = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length }, (_, i) => `${shown}-${String(i + 1).padStart(2, "0")}`);
  const shift = (by: number) => setMonth(new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7));
  const pickedAt = picked ? opens.get(picked) : undefined;

  const arrow = cx(
    "grid h-9 w-9 place-items-center rounded-full transition-colors duration-150 disabled:opacity-30",
    dark ? "text-[#dbe8ef] hover:bg-white/10" : "text-text-2 hover:bg-white",
  );

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous month" disabled={shown <= first} onClick={() => shift(-1)} className={arrow}>
          <IconArrowLeft width={16} height={16} />
        </button>
        <p aria-live="polite" className={cx("text-[0.875rem] font-medium", dark ? "text-white" : "text-ink")}>
          {dayLabel(`${shown}-01`, { month: "long", year: "numeric" })}
        </p>
        <button type="button" aria-label="Next month" disabled={shown >= last} onClick={() => shift(1)} className={arrow}>
          <IconArrowRight width={16} height={16} />
        </button>
      </div>

      <div aria-hidden className={cx("mt-2 grid grid-cols-7 text-center text-[0.75rem]", dark ? "text-[#a9bcc8]/80" : "text-text-3")}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {blanks > 0 && <span style={{ gridColumn: `span ${blanks}` }} />}
        {days.map((day) => {
          const at = opens.get(day);
          const isPicked = day === picked;
          const status = at ? `, opens ${timeLabel(new Date(at), timeZone)}` : day === today ? ", today" : day > today ? ", closed" : "";
          return (
            <button
              key={day}
              type="button"
              disabled={!at || pending}
              aria-pressed={at ? isPicked : undefined}
              aria-label={dayLabel(day, { weekday: "long", month: "long", day: "numeric" }) + status}
              onClick={() => onPick(day)}
              className={cx(
                "mx-auto grid aspect-square w-full max-w-9 place-items-center rounded-full text-[0.8125rem] tabular-nums transition-[background-color,color,transform] duration-150 ease-out",
                isPicked
                  ? GOLD
                  : at
                    ? dark
                      ? "text-[#dbe8ef] hover:bg-white/10 active:scale-[0.94]"
                      : "text-ink hover:bg-white active:scale-[0.94]"
                    : dark
                      ? "text-white/25"
                      : "text-text-3/45",
                day === today && !isPicked && (dark ? "ring-1 ring-inset ring-[#e2c07a]/50" : "ring-1 ring-inset ring-[#c99645]/60"),
              )}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!picked || !pickedAt || pending}
        onClick={() => picked && onGo(picked)}
        className={cx(
          "mt-3 h-10 w-full whitespace-nowrap rounded-[10px] text-[0.8125rem] transition-[filter,transform] duration-150 ease-out active:scale-[0.97]",
          pickedAt ? GOLD : dark ? "bg-white/[0.04] text-[#a9bcc8]" : "bg-white/50 text-text-3",
        )}
      >
        {picked && pickedAt
          ? `Go to ${dayLabel(picked, { weekday: "short", month: "short", day: "numeric" })} · ${timeLabel(new Date(pickedAt), timeZone)}`
          : "Pick a day the clinic is open"}
      </button>
    </div>
  );
}
