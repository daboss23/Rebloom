// Open times for one treatment (brief 3.1 step 8, DECISIONS D-065). Pure: the clinic's hours, the treatment's
// length and what's already booked go in; days with times come out. One treatment room per clinic (D-049), so any
// booked visit in the sandbox takes its time away from everyone.

import type { Clinic, ISODate } from "@/lib/domain";
import { zonedDateTime } from "@/lib/clock";

const DAY_MS = 86_400_000;
const toTime = (iso: ISODate) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const shiftDay = (iso: ISODate, days: number): ISODate => toIso(toTime(iso) + days * DAY_MS);
export const daysFrom = (from: ISODate, to: ISODate) => Math.round((toTime(to) - toTime(from)) / DAY_MS);

/** How far ahead the calendar looks for open days. */
export const HORIZON_DAYS = 42;
/** How many open days the picker offers. */
export const OPEN_DAYS_SHOWN = 10;

export interface Busy {
  startsAt: string;
  endsAt: string;
}

export interface Slot {
  /** The instant it starts, ISO. */
  startsAt: string;
  /** "10:30", wall clock in the clinic's time zone. */
  time: string;
}

export interface OpenDay {
  date: ISODate;
  slots: Slot[];
}

export interface SlotInput {
  clinic: Pick<Clinic, "hours" | "timezone">;
  durationMinutes: number;
  /** The first day that may be offered, in the clinic's time zone. */
  from: ISODate;
  now: Date;
  busy: Busy[];
  /** Days the treatment can't fall on, such as the run-up to the client's event. */
  blocked?: (day: ISODate) => boolean;
  horizonDays?: number;
  maxDays?: number;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Open days from `from`, each with every start time that fits before closing and clears every booked visit. */
export function openDays(input: SlotInput): OpenDay[] {
  const { clinic, durationMinutes, now, busy } = input;
  const horizon = input.horizonDays ?? HORIZON_DAYS;
  const max = input.maxDays ?? OPEN_DAYS_SHOWN;
  const taken = busy.map((b) => [Date.parse(b.startsAt), Date.parse(b.endsAt)] as const);
  const days: OpenDay[] = [];
  for (let i = 0; i < horizon && days.length < max; i++) {
    const date = shiftDay(input.from, i);
    if (input.blocked?.(date)) continue;
    const weekday = new Date(toTime(date)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const hours = clinic.hours.days[weekday];
    if (!hours) continue;
    const slots: Slot[] = [];
    for (let t = minutes(hours.open); t + durationMinutes <= minutes(hours.close); t += clinic.hours.slotMinutes) {
      const start = zonedDateTime(date, hhmm(t), clinic.timezone).getTime();
      const end = start + durationMinutes * 60_000;
      if (start <= now.getTime()) continue;
      if (taken.some(([s, e]) => start < e && s < end)) continue;
      slots.push({ startsAt: new Date(start).toISOString(), time: hhmm(t) });
    }
    if (slots.length > 0) days.push({ date, slots });
  }
  return days;
}

/** True when `startsAt` is one of the open times: what the server checks before holding a time. */
export function isOpen(days: OpenDay[], startsAt: string): boolean {
  return days.some((d) => d.slots.some((s) => s.startsAt === startsAt));
}

/**
 * The days a treatment can't be booked on before an event: inside its minimum gap, up to and including the day
 * itself (brief 8.3). Afterwards is fine.
 */
export function eventBlock(eventDate: ISODate | null, minDaysBeforeEvent: number): (day: ISODate) => boolean {
  if (!eventDate || minDaysBeforeEvent <= 0) return () => false;
  return (day) => {
    const before = daysFrom(day, eventDate);
    return before >= 0 && before < minDaysBeforeEvent;
  };
}
