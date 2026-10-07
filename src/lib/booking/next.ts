// What a client books next, from their report link (DECISIONS D-065). Pure. One visit is booked at a time:
// with one coming up, the report shows it instead of offering another.
//
//   No plan yet          the first session of the plan their report suggests. Booking it keeps that plan as
//                        "proposed" for the practitioner to confirm at the visit (D-055).
//   A course under way   the session of the plan that's due soonest: its last visit plus the treatment's
//                        shortest interval, or the plan's own date for a treatment not started yet.
//   Course complete      a maintenance visit of the first treatment that has one.

import type { Appointment, ISODate, Treatment } from "@/lib/domain";
import type { Plan } from "@/lib/plan/build";
import type { PlanWithItems } from "@/lib/store/types";
import { shiftDay } from "./slots";

export type BookingReason = "first" | "next" | "maintenance";

export interface BookingTarget {
  treatment: Treatment;
  reason: BookingReason;
  /** Which session this is, from 1. Null for maintenance. */
  session: number | null;
  /** Sessions in the course. Null for maintenance. */
  of: number | null;
  /** The plan line it books against. Null until the suggested plan is kept, and for maintenance. */
  planItemId: string | null;
  /** The first day that may be offered. */
  earliest: ISODate;
}

export interface NextBookingInput {
  /** The client's live plan (proposed or confirmed), if any. */
  plan: PlanWithItems | null;
  /** The plan their latest report suggests. */
  suggested: Plan | null;
  /** This client's appointments. Unpaid holds are left out by the caller. */
  appointments: Appointment[];
  treatments: Treatment[];
  now: Date;
  /** "YYYY-MM-DD" in the clinic's time zone. */
  today: ISODate;
  timeZone: string;
}

export interface NextBooking {
  /** The visit already booked, soonest first. */
  upcoming: Appointment | null;
  /** What to offer when nothing is booked. Null when there's nothing to book from here. */
  target: BookingTarget | null;
}

const localDay = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export function nextBooking(input: NextBookingInput): NextBooking {
  const { plan, appointments, treatments, now, today, timeZone } = input;
  const upcoming =
    appointments
      .filter((a) => a.status === "booked" && Date.parse(a.startsAt) > now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
  if (upcoming) return { upcoming, target: null };

  const tomorrow = shiftDay(today, 1);
  const later = (a: ISODate, b: ISODate) => (a > b ? a : b);
  const done = appointments.filter((a) => a.status === "completed").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const lastDone = (pred: (a: Appointment) => boolean) => [...done].reverse().find(pred);

  if (plan) {
    const open = plan.items.flatMap((item, position) => {
      const treatment = treatments.find((t) => t.id === item.treatmentId);
      if (!treatment) return [];
      const doneHere = done.filter((a) => a.planItemId === item.id);
      if (doneHere.length >= item.quantity) return [];
      const last = doneHere[doneHere.length - 1];
      const due = last ? shiftDay(localDay(last.startsAt, timeZone), treatment.intervalDaysMin) : (item.targetDate ?? tomorrow);
      return [{ item, treatment, session: doneHere.length + 1, due, position }];
    });
    const soonest = open.sort((a, b) => a.due.localeCompare(b.due) || a.position - b.position)[0];
    if (soonest) {
      return {
        upcoming: null,
        target: {
          treatment: soonest.treatment,
          reason: soonest.session === 1 ? "first" : "next",
          session: soonest.session,
          of: soonest.item.quantity,
          planItemId: soonest.item.id,
          earliest: later(tomorrow, soonest.due),
        },
      };
    }
    // Every session is done: a maintenance visit keeps the result.
    for (const item of plan.items) {
      const treatment = treatments.find((t) => t.id === item.treatmentId);
      if (!treatment?.maintenanceIntervalDays) continue;
      const last = lastDone((a) => a.treatmentId === treatment.id);
      const due = last ? shiftDay(localDay(last.startsAt, timeZone), treatment.intervalDaysMin) : tomorrow;
      return { upcoming: null, target: { treatment, reason: "maintenance", session: null, of: null, planItemId: null, earliest: later(tomorrow, due) } };
    }
    return { upcoming: null, target: null };
  }

  const first = input.suggested?.timeline.find((s) => s.kind === "session");
  if (!first || first.kind !== "session") return { upcoming: null, target: null };
  return {
    upcoming: null,
    target: { treatment: first.treatment, reason: "first", session: 1, of: first.of, planItemId: null, earliest: tomorrow },
  };
}
