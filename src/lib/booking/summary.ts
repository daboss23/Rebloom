import "server-only";
// The report's booking line (DECISIONS D-065): the visit already booked, or the button for the one to book next.

import type { BookingSummary } from "@/components/report/PlanSections";
import { bookingContext } from "./service";
import { bookingWords, sessionLabel } from "./words";

export async function bookingSummary(token: string): Promise<BookingSummary | null> {
  // The report must always open: if booking can't be worked out, it offers the phone instead.
  const ctx = await bookingContext(token).catch((e) => {
    console.error(`Booking summary unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  });
  if (!ctx) return null;
  const { clinic, intake } = ctx.data;
  const href = `/r/${token}/book`;
  /** "Thu Oct 8 at 10:00 AM" in the clinic's time zone. */
  const when = (iso: string) => {
    const at = new Date(iso);
    const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: clinic.timezone }).format(at).replace(",", "");
    return `${day} at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: clinic.timezone }).format(at)}`;
  };
  if (ctx.upcoming) {
    return { href, cta: null, nextOpen: null, returning: null, upcoming: { when: when(ctx.upcoming.startsAt), what: ctx.upcomingTreatment?.name ?? (ctx.upcoming.kind === "consult" ? "Consultation" : "Your visit") } };
  }
  if (!ctx.target) return { href, cta: null, nextOpen: null, returning: null, upcoming: null };
  const first = ctx.days[0]?.slots[0];
  return {
    href,
    cta: bookingWords({ target: ctx.target, clinic, intake, today: ctx.today }).cta,
    nextOpen: first ? when(first.startsAt) : null,
    returning:
      ctx.target.reason === "maintenance" ? "A maintenance visit" : ctx.target.reason === "next" ? sessionLabel(ctx.target) : null,
    upcoming: null,
  };
}
