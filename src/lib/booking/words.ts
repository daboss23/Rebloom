// What the booking page says about the visit on offer (DECISIONS D-065). Pure, so it's tested and copy-checked.
// The calm, exact voice of the report (brief 7.7): what it is, how long, what it costs, and why the first day
// offered is that day.

import type { Clinic, ISODate, Intake } from "@/lib/domain";
import { EVENT_OPTIONS } from "@/lib/flow/intake-options";
import { formatPrice } from "@/lib/plan/build";
import type { BookingTarget } from "./next";
import { daysFrom, shiftDay } from "./slots";

const longDay = (iso: ISODate) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const shortDay = (iso: ISODate) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** "Session 2 of 3", or null for a maintenance visit. */
export function sessionLabel(target: Pick<BookingTarget, "session" | "of">): string | null {
  return target.session && target.of ? `Session ${target.session} of ${target.of}` : null;
}

export interface BookingWords {
  kicker: string;
  title: string;
  /** Length, price and place, on one line. */
  facts: string;
  /** Why the first day offered is that day, when it isn't simply tomorrow. */
  why: string | null;
  /** The days held clear before the client's event, when any are. */
  eventNote: string | null;
  /** The label for the report's gold button. */
  cta: string;
}

export function bookingWords(input: { target: BookingTarget; clinic: Pick<Clinic, "name" | "city">; intake: Intake | null; today: ISODate }): BookingWords {
  const { target, clinic, intake, today } = input;
  const t = target.treatment;
  const facts = `${t.durationMinutes} minutes · ${formatPrice(t.priceCents)} · ${clinic.name}, ${clinic.city}`;
  const later = daysFrom(today, target.earliest) > 1;

  let kicker: string;
  let title: string;
  let why: string | null = null;
  let cta: string;
  if (target.reason === "maintenance") {
    kicker = "Book · Maintenance";
    title = `${t.name}, to keep your result.`;
    cta = "Book a maintenance visit";
  } else if (target.reason === "first") {
    kicker = `Book · ${sessionLabel(target) ?? "First visit"}`;
    title = `Consultation and ${t.name}.`;
    cta = "Book your first session";
    if (later) why = `Your plan begins on ${longDay(target.earliest)}, so that's the first day we offer.`;
  } else {
    kicker = `Book · ${sessionLabel(target)}`;
    title = `${t.name}, session ${target.session}.`;
    cta = `Book session ${target.session} of ${target.of}`;
    if (later) why = `Your skin needs at least ${t.intervalDaysMin} days between sessions, so the first day we offer is ${longDay(target.earliest)}.`;
  }

  let eventNote: string | null = null;
  if (intake?.hasEvent && intake.eventDate && t.minDaysBeforeEvent > 0 && intake.eventDate >= today) {
    const type = intake.eventType && intake.eventType !== "other" ? (EVENT_OPTIONS.find(([v]) => v === intake.eventType)?.[1] ?? "event").toLowerCase() : "event";
    const from = shiftDay(intake.eventDate, -(t.minDaysBeforeEvent - 1));
    eventNote = `To keep your skin settled for your ${type}, we don't offer this treatment from ${shortDay(from)} to ${shortDay(intake.eventDate)}.`;
  }
  return { kicker, title, facts, why, eventNote, cta };
}
