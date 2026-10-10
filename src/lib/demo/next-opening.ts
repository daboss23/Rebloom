// The demo clock's jump to the next opening (DECISIONS D-091): the moment the clinic next opens its doors, so a
// demo opened in the evening can still be seen as the day begins.

import { isoDateInZone, splitOffset, zonedDateTime } from "@/lib/clock";
import type { Clinic } from "@/lib/domain";
import { nextOpenDay, shiftDate } from "@/lib/plan/build";

/** When the clinic next opens after `now`: later today if it hasn't opened yet, else the next open day. */
export function nextOpening(now: Date, clinic: Pick<Clinic, "hours" | "timezone">): Date | null {
  const today = isoDateInZone(now, clinic.timezone);
  const openAt = (day: string) => {
    const hours = clinic.hours.days[new Date(`${day}T12:00:00Z`).getUTCDay() as 0];
    return hours ? zonedDateTime(day, hours.open, clinic.timezone) : null;
  };
  const later = openAt(today);
  if (later && later > now) return later;
  if (Object.keys(clinic.hours.days).length === 0) return null;
  return openAt(nextOpenDay(shiftDate(today, 1), clinic.hours));
}

/**
 * The clock offset that puts `base` (the clock with no offset) at `target`, as days and minutes. Rounded up to the
 * minute, so the clock lands on the opening, never a moment before it.
 */
export function offsetTo(target: Date, base: Date): { days: number; minutes: number } {
  return splitOffset(Math.ceil((target.getTime() - base.getTime()) / 60_000));
}
