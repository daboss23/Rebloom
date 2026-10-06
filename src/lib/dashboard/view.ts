// What the dashboard screens show, worked out from the engine's facts. Pure, so it's tested without a page.

import type { Appointment, ClientStatus, ISODate, Treatment } from "@/lib/domain";
import { isoDateInZone } from "@/lib/clock";
import { daysBetween, priorityKeys, type ClientFacts, type Queue, type QueueItem } from "@/lib/rebook/engine";
import { concernLabel, type ConcernKey } from "@/lib/skin/concerns";

export const STATUS_LABEL: Record<ClientStatus, string> = {
  started: "Scanning",
  lead: "New lead",
  booked: "Booked",
  in_course: "In course",
  course_complete: "Course complete",
  at_risk: "At risk",
  lapsed: "Lapsed",
};

/** "Amelia R." for headings, as on the mockup's brief. */
export function shortName(c: { firstName: string | null; lastName: string | null }): string {
  if (!c.firstName) return "New client";
  return c.lastName ? `${c.firstName} ${c.lastName[0]}.` : c.firstName;
}

export function fullName(c: { firstName: string | null; lastName: string | null }): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "New client";
}

/** The status the clinic should see now: the engine's flags win over the stored one, which only changes on events. */
export function statusOf(facts: ClientFacts, item: QueueItem | undefined): ClientStatus {
  if (item?.kind === "lapsed") return "lapsed";
  if (item?.atRisk) return "at_risk";
  return facts.client.status;
}

export interface ScoreTrend {
  key: ConcernKey;
  label: string;
  /** ui scores, one per scan, oldest first. */
  series: number[];
  /** Latest minus first, in ui points. Null with a single scan. */
  delta: number | null;
}

/** The client's lead priority over their scans: the number a practitioner looks at first. */
export function leadTrend(facts: ClientFacts, key = priorityKeys(facts)[0]): ScoreTrend | null {
  if (!key) return null;
  const series = facts.scans.map((s) => s.result!.concerns.find((c) => c.key === key)?.ui).filter((v): v is number => v !== undefined);
  if (series.length === 0) return null;
  return { key, label: concernLabel(key), series, delta: series.length > 1 ? series[series.length - 1] - series[0] : null };
}

export interface ClientRow {
  facts: ClientFacts;
  status: ClientStatus;
  item: QueueItem | undefined;
  lastVisit: ISODate | null;
  nextVisit: ISODate | null;
  trend: ScoreTrend | null;
}

export function clientRows(facts: ClientFacts[], queue: Queue, now: Date, timeZone: string): ClientRow[] {
  const local = (a: Appointment) => isoDateInZone(new Date(a.startsAt), timeZone);
  const pending = new Map(queue.items.map((i) => [i.clientId, i]));
  return facts
    .filter((f) => f.client.firstName && f.scans.length > 0)
    .map((f) => {
      const item = pending.get(f.client.id);
      const done = f.appointments.filter((a) => a.status === "completed");
      const next = f.appointments.find((a) => a.status === "booked" && a.startsAt >= now.toISOString());
      return {
        facts: f,
        status: statusOf(f, item),
        item,
        lastVisit: done.length ? local(done[done.length - 1]) : null,
        nextVisit: next ? local(next) : null,
        trend: leadTrend(f),
      };
    });
}

export interface Visit {
  appointment: Appointment;
  facts: ClientFacts;
  treatment: Treatment | null;
  /** "11:00" in the clinic's time zone. */
  time: string;
  minutes: number;
  /** Which session of the course this is, when it's part of one: "Session 4 of 6". */
  session: string | null;
}

/** One day's visits in time order. */
export function visitsOn(day: ISODate, facts: ClientFacts[], treatments: Treatment[], timeZone: string): Visit[] {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  return facts
    .flatMap((f) =>
      f.appointments
        .filter((a) => a.status !== "cancelled" && isoDateInZone(new Date(a.startsAt), timeZone) === day)
        .map((appointment) => {
          const treatment = treatments.find((t) => t.id === appointment.treatmentId) ?? null;
          const item = f.plan?.items.find((i) => i.id === appointment.planItemId);
          const n = item ? f.appointments.filter((a) => a.planItemId === item.id && a.startsAt <= appointment.startsAt).length : 0;
          return {
            appointment,
            facts: f,
            treatment,
            time: time.format(new Date(appointment.startsAt)),
            minutes: Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000),
            session: item ? `Session ${n} of ${item.quantity}` : null,
          };
        }),
    )
    .sort((a, b) => a.appointment.startsAt.localeCompare(b.appointment.startsAt));
}

/** "Tue Oct 6" */
export function shortDay(day: ISODate): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`))
    .replace(",", "");
}

/** "Oct 6" */
export function monthDay(day: ISODate): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/** "Today", "Tomorrow", "In 5 days", "3 days ago", or a date further out. */
export function relativeDay(day: ISODate, today: ISODate): string {
  const d = daysBetween(today, day);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d < 7) return `In ${d} days`;
  if (d < -1 && d > -14) return `${-d} days ago`;
  return monthDay(day);
}
