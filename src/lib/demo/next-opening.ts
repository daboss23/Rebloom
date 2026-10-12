// The demo clock's jump to the next opening (DECISIONS D-091): the moment the clinic next opens its doors, so a
// demo opened in the evening can still be seen as the day begins.

import { isoDateInZone, splitOffset, zonedDateTime } from "@/lib/clock";
import type { Clinic } from "@/lib/domain";
import { nextOpenDay, shiftDate } from "@/lib/plan/build";

/** When the clinic opens on `day` ("YYYY-MM-DD" in its zone), or null when it's closed that day. */
export function openingOn(day: string, clinic: Pick<Clinic, "hours" | "timezone">): Date | null {
  const hours = clinic.hours.days[new Date(`${day}T12:00:00Z`).getUTCDay() as 0];
  return hours ? zonedDateTime(day, hours.open, clinic.timezone) : null;
}

/** When the clinic next opens after `now`: later today if it hasn't opened yet, else the next open day. */
export function nextOpening(now: Date, clinic: Pick<Clinic, "hours" | "timezone">): Date | null {
  const today = isoDateInZone(now, clinic.timezone);
  const later = openingOn(today, clinic);
  if (later && later > now) return later;
  if (Object.keys(clinic.hours.days).length === 0) return null;
  return openingOn(nextOpenDay(shiftDate(today, 1), clinic.hours), clinic);
}

/** How far the clock may jump in one go, by date or by step. */
export const JUMP_HORIZON_DAYS = 90;

export interface Opening {
  /** "YYYY-MM-DD" in the clinic's zone. */
  day: string;
  /** The moment the doors open that day. */
  at: Date;
}

/**
 * The days the demo clock's calendar offers: every opening after `now`, up to the horizon. Each one lands on the
 * opening itself, so a jump by date always arrives as the day begins.
 */
export function openingsAhead(now: Date, clinic: Pick<Clinic, "hours" | "timezone">, horizonDays = JUMP_HORIZON_DAYS): Opening[] {
  const limit = now.getTime() + horizonDays * 86_400_000;
  const out: Opening[] = [];
  let day = isoDateInZone(now, clinic.timezone);
  for (let i = 0; i <= horizonDays; i++, day = shiftDate(day, 1)) {
    const at = openingOn(day, clinic);
    if (at && at > now && at.getTime() <= limit) out.push({ day, at });
  }
  return out;
}

/**
 * The clock offset that puts `base` (the clock with no offset) at `target`, as days and minutes. Rounded up to the
 * minute, so the clock lands on the opening, never a moment before it.
 */
export function offsetTo(target: Date, base: Date): { days: number; minutes: number } {
  return splitOffset(Math.ceil((target.getTime() - base.getTime()) / 60_000));
}
