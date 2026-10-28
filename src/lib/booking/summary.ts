import "server-only";
// The report's booking line (DECISIONS D-065): the visit already booked, or the button for the one to book next.

import type { BookingSummary, CourseSummary } from "@/components/report/PlanSections";
import type { BookingContext } from "./service";
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
  const course = courseSummary(ctx, clinic.timezone);
  if (ctx.upcoming) {
    return { href, course, cta: null, nextOpen: null, returning: null, upcoming: { when: when(ctx.upcoming.startsAt), what: ctx.upcomingTreatment?.name ?? (ctx.upcoming.kind === "consult" ? "Consultation" : "Your visit") } };
  }
  if (!ctx.target) return { href, course, cta: null, nextOpen: null, returning: null, upcoming: null };
  const first = ctx.days[0]?.slots[0];
  return {
    href,
    course,
    cta: bookingWords({ target: ctx.target, clinic, intake, today: ctx.today }).cta,
    nextOpen: first ? when(first.startsAt) : null,
    returning:
      ctx.target.reason === "maintenance" ? "A maintenance visit" : ctx.target.reason === "next" ? sessionLabel(ctx.target) : null,
    upcoming: null,
  };
}

/**
 * A returning client's confirmed course, as agreed: each treatment with its sessions done and booked, at the prices
 * fixed when it was confirmed (D-055). The report shows this instead of a fresh suggestion, so "Book session 3 of 3"
 * and the plan below it tell the same story. Null before a plan is confirmed.
 */
function courseSummary(ctx: BookingContext, timeZone: string): CourseSummary | null {
  const { plan } = ctx;
  if (!plan || plan.status !== "confirmed") return null;
  const lines = plan.items
    .filter((i) => i.treatmentId)
    .map((i) => {
      const mine = ctx.appointments.filter((a) => a.planItemId === i.id);
      return {
        name: ctx.treatments.find((t) => t.id === i.treatmentId)?.name ?? "Treatment",
        sessions: i.quantity,
        done: mine.filter((a) => a.status === "completed").length,
        booked: mine.filter((a) => a.status === "booked").length,
        totalCents: i.quantity * i.unitPriceCents,
      };
    });
  if (lines.length === 0) return null;
  const homeCare = plan.items
    .filter((i) => i.productId)
    .map((i) => ({ name: ctx.products.find((p) => p.id === i.productId)?.name ?? "Product", totalCents: i.quantity * i.unitPriceCents }));
  const confirmedOn = plan.confirmedAt
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone }).format(new Date(plan.confirmedAt))
    : null;
  return { lines, homeCare, totalCents: plan.totalCents, confirmedOn };
}
