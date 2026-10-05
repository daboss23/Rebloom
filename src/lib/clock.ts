// The virtual clock (DECISIONS D-016). Every product date comes from here, never from `new Date()`.
// Real time is still used for security concerns: token expiry, rate limits, auto-delete.

const DAY_MS = 86_400_000;

export interface ClockConfig {
  /** "YYYY-MM-DD" to pin the demo calendar, or undefined for real time. */
  demoToday?: string;
  /** Days moved forward by time travel. */
  offsetDays?: number;
}

export function virtualNow(config: ClockConfig = {}, realNow: Date = new Date()): Date {
  let base = realNow.getTime();
  if (config.demoToday) {
    // Keep the real time of day, move the date to the pinned demo day.
    const [y, m, d] = config.demoToday.split("-").map(Number);
    const pinned = Date.UTC(y, m - 1, d, realNow.getUTCHours(), realNow.getUTCMinutes(), realNow.getUTCSeconds());
    base = pinned;
  }
  return new Date(base + (config.offsetDays ?? 0) * DAY_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** "October 5, 2026" in the clinic's time zone. */
export function formatLongDate(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone }).format(
    new Date(date),
  );
}

/** "THU OCT 8" style, for timelines. */
export function formatShortDay(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone })
    .format(new Date(date))
    .replace(",", "");
}

/** "2026-10-05" for the given instant, in the given time zone. */
export function isoDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
  return parts; // en-CA formats as YYYY-MM-DD
}
