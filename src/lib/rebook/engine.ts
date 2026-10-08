// The rebook engine (brief 3.4). Pure and rules-based: the same rows and the same "today" always give
// the same queue. Every item says, in one sentence, why this person should hear from the clinic now.
// Progress is measured on raw scores and shown in ui points (DECISIONS D-009, D-010).

import type {
  Appointment,
  Client,
  Clinic,
  Consent,
  ISODate,
  Intake,
  Message,
  PlanItem,
  Product,
  Report,
  Scan,
  Treatment,
} from "@/lib/domain";
import { isoDateInZone } from "@/lib/clock";
import { buildPlan, rankPriorities, shiftDate, statedConcerns } from "@/lib/plan/build";
import { concernLabel, type ConcernKey } from "@/lib/skin/concerns";
import { TEXT_OPT_OUT, toUsE164 } from "@/lib/sms/text";
import type { PlanWithItems } from "@/lib/store/types";
import {
  LAPSED_AFTER_DAYS,
  MISSED_AFTER_DAYS,
  PROGRESS_MOMENT_FRESH_DAYS,
  PROGRESS_MOMENT_RAW_DELTA,
  PROGRESS_SCAN_AFTER_DAYS,
  REPORT_FOLLOW_UP_DAYS,
  SESSION_REMINDER_DAYS,
  STALLED_RAW_DELTA,
} from "./thresholds";

export type TriggerKind =
  | "stalled"
  | "progress_moment"
  | "missed"
  | "lapsed"
  | "next_session_due"
  | "report_follow_up"
  | "progress_scan_due"
  | "maintenance_due";

/** Most pressing first. A client appears once, under the first trigger that fires. */
export const TRIGGER_ORDER: TriggerKind[] = [
  "progress_moment",
  "stalled",
  "missed",
  "next_session_due",
  "report_follow_up",
  "progress_scan_due",
  "maintenance_due",
  "lapsed",
];

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  progress_moment: "Progress moment",
  stalled: "Stalled",
  missed: "Missed",
  lapsed: "Lapsed",
  next_session_due: "Session due",
  report_follow_up: "New lead",
  progress_scan_due: "Scan due",
  maintenance_due: "Maintenance",
};

/**
 * Email: a pre-written message to review, with a text beside it when they agreed to texts. Text: texts only, no
 * email consent (D-080). Call: no consent to either. Review: a decision for the practitioner.
 */
export type QueueAction = "email" | "text" | "call" | "review";

export interface QueueItem {
  clientId: string;
  kind: TriggerKind;
  action: QueueAction;
  /** One plain sentence: why now. */
  reason: string;
  /** What booking back in is worth, from the clinic's menu. Null when there's nothing to book. */
  valueCents: number | null;
  /** "2 sessions" or "Suggested plan": what the value counts. */
  valueNote: string | null;
  /** The day this became due, "YYYY-MM-DD". */
  dueDate: ISODate;
  /** At risk of leaving: flagged on the client list (brief 3.4). */
  atRisk: boolean;
  /** Idempotency key for the outbox: once a message carries it, the item is done. */
  dedupeKey: string;
  /** The pre-written email. Null for calls, reviews, and clients who only agreed to texts. */
  draft: { subject: string; body: string } | null;
  /** The pre-written text, for a client who agreed to texts (D-080). Null otherwise. */
  text: string | null;
}

export interface HandledItem {
  item: QueueItem;
  message: Message;
}

export interface EngineInput {
  clinic: Pick<Clinic, "name" | "timezone" | "hours" | "phone">;
  /** Signs the drafts: "Dana". */
  practitionerName: string;
  now: Date;
  /** Turns a report token into the link a client can open. */
  reportUrl: (token: string) => string;
  treatments: Treatment[];
  products: Product[];
  clients: Client[];
  consents: Consent[];
  intakes: Intake[];
  scans: Scan[];
  reports: Report[];
  plans: PlanWithItems[];
  appointments: Appointment[];
  messages: Message[];
}

export interface Queue {
  today: ISODate;
  /** Waiting on the practitioner, most pressing first. */
  items: QueueItem[];
  /** Already sent or marked done, newest first. */
  handled: HandledItem[];
}

const DAY_MS = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
export const daysBetween = (from: ISODate, to: ISODate) => Math.round((toTime(to) - toTime(from)) / DAY_MS);

/** Everything the engine knows about one client. */
export interface ClientFacts {
  client: Client;
  intake: Intake | null;
  report: Report | null;
  /** Completed scans with results, oldest first. */
  scans: Scan[];
  plan: PlanWithItems | null;
  appointments: Appointment[];
  messages: Message[];
  canEmail: boolean;
  /** A US mobile number and a yes to texts (D-080). */
  canText: boolean;
}

export interface Course {
  item: PlanItem;
  treatment: Treatment;
  done: Appointment[];
  booked: Appointment[];
  /** Sessions neither done nor booked. */
  unbooked: number;
}

/** Splits rows by client, once, so each rule reads only its own client's rows. */
export function clientFacts(input: EngineInput): ClientFacts[] {
  const group = <T extends { clientId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) map.set(row.clientId, [...(map.get(row.clientId) ?? []), row]);
    return map;
  };
  const [consents, scans, plans, appointments, messages] = [
    group(input.consents),
    group(input.scans),
    group(input.plans),
    group(input.appointments),
    group(input.messages),
  ];
  const intakes = new Map(input.intakes.map((i) => [i.clientId, i]));
  const reports = new Map(input.reports.map((r) => [r.clientId, r]));
  return input.clients.map((client) => {
    const live = (plans.get(client.id) ?? []).filter((p) => p.status !== "cancelled");
    return {
      client,
      intake: intakes.get(client.id) ?? null,
      report: reports.get(client.id) ?? null,
      scans: (scans.get(client.id) ?? [])
        .filter((s) => s.status === "complete" && s.result)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      plan: live[live.length - 1] ?? null,
      appointments: (appointments.get(client.id) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      messages: messages.get(client.id) ?? [],
      canEmail: Boolean(client.email) && (consents.get(client.id) ?? []).some((c) => c.type === "reminders"),
      canText: Boolean(toUsE164(client.phone)) && (consents.get(client.id) ?? []).some((c) => c.type === "texts"),
    };
  });
}

/** Each treatment on the plan, with its sessions done, booked and still to book. */
export function courses(facts: ClientFacts, treatments: Treatment[]): Course[] {
  if (!facts.plan) return [];
  return facts.plan.items.flatMap((item) => {
    const treatment = treatments.find((t) => t.id === item.treatmentId);
    if (!treatment) return [];
    const mine = facts.appointments.filter((a) => a.planItemId === item.id);
    const done = mine.filter((a) => a.status === "completed");
    const booked = mine.filter((a) => a.status === "booked");
    return [{ item, treatment, done, booked, unbooked: Math.max(0, item.quantity - done.length - booked.length) }];
  });
}

const raw = (scan: Scan, key: ConcernKey) => scan.result!.concerns.find((c) => c.key === key)?.raw ?? null;
const ui = (scan: Scan, key: ConcernKey) => scan.result!.concerns.find((c) => c.key === key)?.ui ?? null;

/** The concerns that matter for this client, ranked from their first scan and their own goals. */
export function priorityKeys(facts: ClientFacts): ConcernKey[] {
  const first = facts.scans[0];
  if (!first?.result) return [];
  return rankPriorities(first.result, statedConcerns(facts.intake)).map((c) => c.key);
}

/** The best real change since scan 01 on a priority concern: raw clears the bar, ui shows the same way. */
export function bestChange(facts: ClientFacts): { key: ConcernKey; uiDelta: number; rawDelta: number } | null {
  const [first, latest] = [facts.scans[0], facts.scans[facts.scans.length - 1]];
  if (!first || !latest || first === latest || latest.comparisonConfidence === "lower") return null;
  let best: { key: ConcernKey; uiDelta: number; rawDelta: number } | null = null;
  for (const key of priorityKeys(facts)) {
    const [r0, r1, u0, u1] = [raw(first, key), raw(latest, key), ui(first, key), ui(latest, key)];
    if (r0 === null || r1 === null || u0 === null || u1 === null) continue;
    const change = { key, uiDelta: u1 - u0, rawDelta: r1 - r0 };
    if (change.uiDelta > 0 && (!best || change.rawDelta > best.rawDelta)) best = change;
  }
  return best;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ago(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

function until(days: number, date: ISODate): string {
  if (days < 0) return `was due ${ago(-days)}`;
  if (days === 0) return "is due today";
  if (days === 1) return "is due tomorrow";
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(toTime(date)));
  return `is due ${weekday}`;
}

/** "today's", "tomorrow's" or "Thursday's", for a session coming up. */
function sessionDay(days: number, date: ISODate): string {
  if (days <= 0) return "today's";
  if (days === 1) return "tomorrow's";
  return `${new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(toTime(date)))}'s`;
}

const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const nth = (n: number) => ORDINAL[n - 1] ?? `number ${n}`;

/** Lowercases a treatment name for the middle of a sentence, keeping acronyms: "IPL photofacial". */
const inSentence = (name: string) =>
  name
    .split(" ")
    .map((w) => (w === w.toUpperCase() && w.length > 1 ? w : w.toLowerCase()))
    .join(" ");

/** "peel" from "Signature Peel Series": what one session of it is called. */
function sessionNoun(t: Treatment): string {
  const n = t.name.toLowerCase();
  if (n.includes("peel")) return "peel";
  if (n.includes("facial")) return "facial";
  return `${inSentence(t.name)} session`;
}

export function buildQueue(input: EngineInput): Queue {
  const today = isoDateInZone(input.now, input.clinic.timezone);
  const local = (instant: string) => isoDateInZone(new Date(instant), input.clinic.timezone);
  const items: QueueItem[] = [];
  const handled: HandledItem[] = [];

  for (const facts of clientFacts(input)) {
    const item = evaluate(facts);
    if (!item) continue;
    const message = facts.messages.find((m) => m.dedupeKey === item.dedupeKey && (m.status === "sent" || m.status === "skipped"));
    if (message) handled.push({ item, message });
    else items.push(item);
  }

  items.sort((a, b) => TRIGGER_ORDER.indexOf(a.kind) - TRIGGER_ORDER.indexOf(b.kind) || a.dueDate.localeCompare(b.dueDate));
  handled.sort((a, b) => (b.message.sentAt ?? b.message.createdAt).localeCompare(a.message.sentAt ?? a.message.createdAt));
  return { today, items, handled };

  function evaluate(facts: ClientFacts): QueueItem | null {
    const { client } = facts;
    if (facts.scans.length === 0 || !client.firstName) return null;
    const name = client.firstName;
    const sign = `${input.practitionerName}\n${input.clinic.name}`;
    const link = facts.report ? input.reportUrl(facts.report.token) : null;
    const upcoming = facts.appointments.filter((a) => a.status === "booked" && a.startsAt >= input.now.toISOString());
    const all = courses(facts, input.treatments);
    const inProgress = facts.plan?.status === "confirmed" && all.some((c) => c.unbooked > 0 || c.booked.length > 0);
    const courseDone = all.length > 0 && all.every((c) => c.unbooked === 0 && c.booked.length === 0);
    const remainingValue = all.reduce((n, c) => n + c.unbooked * c.item.unitPriceCents, 0);
    const remainingSessions = all.reduce((n, c) => n + c.unbooked, 0);
    const lastScan = facts.scans[facts.scans.length - 1];
    const candidates: QueueItem[] = [];

    // Texts open with who's writing and end with the way out (D-080). Written to fit in two parts.
    const texted = (...parts: (string | null | false)[]) =>
      [`Hi ${name}, it's ${input.practitionerName} at ${input.clinic.name}.`, ...parts.filter(Boolean), TEXT_OPT_OUT].join(" ");

    const make = (kind: TriggerKind, rest: Omit<QueueItem, "clientId" | "kind" | "action" | "draft" | "text" | "atRisk"> & {
      draft: QueueItem["draft"];
      text?: string;
      action?: QueueAction;
      atRisk?: boolean;
    }): QueueItem => {
      const action =
        rest.action ?? (rest.draft ? (facts.canEmail ? "email" : facts.canText && rest.text ? "text" : "call") : "review");
      const message = action === "email" || action === "text";
      return {
        ...rest,
        clientId: client.id,
        kind,
        action,
        atRisk: rest.atRisk ?? false,
        draft: message && facts.canEmail ? rest.draft : null,
        text: message && facts.canText ? (rest.text ?? null) : null,
      };
    };

    // ---------- The next unbooked session of a course in progress ----------
    const next = inProgress
      ? all
          .filter((c) => c.unbooked > 0 && c.booked.length === 0 && c.done.length > 0)
          .map((c) => {
            const last = local(c.done[c.done.length - 1].startsAt);
            return { course: c, soonest: shiftDate(last, c.treatment.intervalDaysMin), latest: shiftDate(last, c.treatment.intervalDaysMax) };
          })
          .sort((a, b) => a.soonest.localeCompare(b.soonest))[0]
      : undefined;
    const value = { valueCents: remainingValue || null, valueNote: remainingSessions ? plural(remainingSessions, "session") : null };

    // ---------- Progress moment ----------
    const change = bestChange(facts);
    const fresh = lastScan && daysBetween(local(lastScan.createdAt), today) <= PROGRESS_MOMENT_FRESH_DAYS;
    if (change && fresh && change.rawDelta >= PROGRESS_MOMENT_RAW_DELTA && upcoming.length === 0 && (next || courseDone)) {
      const label = concernLabel(change.key);
      const tail = next
        ? `The ${nth(next.course.done.length + 1)} ${sessionNoun(next.course.treatment)} isn't booked.`
        : "Nothing booked since the course ended.";
      const maintenance = courseDone ? all.find((c) => c.treatment.maintenanceIntervalDays) : undefined;
      candidates.push(
        make("progress_moment", {
          reason: `${label} improved ${change.uiDelta} points since the first scan. ${tail}`,
          dueDate: local(lastScan.createdAt),
          dedupeKey: `progress_moment:${lastScan.id}`,
          text: texted(
            `Your latest scan shows your ${label.toLowerCase()} up ${change.uiDelta} points since your first.`,
            next ? `It's the best moment for your next ${sessionNoun(next.course.treatment)}.` : "A maintenance visit now keeps it there.",
            link ? `Book here: ${link}` : "Reply and I'll hold a time for you.",
          ),
          ...(next ? value : { valueCents: maintenance?.item.unitPriceCents ?? null, valueNote: maintenance ? "1 session" : null }),
          draft: {
            subject: `Real change on your latest scan, ${name}`,
            body: [
              `Hi ${name},`,
              `Your latest scan shows real change. Your ${label.toLowerCase()} score has improved ${change.uiDelta} points since your first scan, measured in the same light both times.`,
              next
                ? `This is the best moment for your next ${sessionNoun(next.course.treatment)}, while the change is still building. Reply to this email or book here and I'll hold a time for you.`
                : `A maintenance visit now keeps that change where it is. Reply to this email or book here and I'll hold a time for you.`,
              link ?? "",
              sign,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        }),
      );
    }

    // ---------- Stalled ----------
    const keys = priorityKeys(facts);
    if (facts.scans.length >= 3 && keys.length > 0 && !courseDone) {
      const [a, b, c] = facts.scans.slice(-3);
      const flat = (x: Scan, y: Scan) => keys.every((k) => Math.abs((raw(y, k) ?? 0) - (raw(x, k) ?? 0)) < STALLED_RAW_DELTA);
      if (flat(a, b) && flat(b, c) && c.comparisonConfidence !== "lower") {
        const session = upcoming[0];
        candidates.push(
          make("stalled", {
            reason: `Two rescans in a row with almost no change on ${concernLabel(keys[0]).toLowerCase()}. ${
              session ? `Review the plan before ${sessionDay(daysBetween(today, local(session.startsAt)), local(session.startsAt))} session.` : "Review the plan."
            }`,
            dueDate: local(c.createdAt),
            dedupeKey: `stalled:${c.id}`,
            valueCents: null,
            valueNote: null,
            atRisk: true,
            action: "review",
            draft: null,
          }),
        );
      }
    }

    // ---------- Missed, lapsed, or simply due ----------
    if (next) {
      const overdue = daysBetween(next.latest, today);
      const noun = sessionNoun(next.course.treatment);
      const session = `${nth(next.course.done.length + 1)} ${noun}`;
      if (overdue >= LAPSED_AFTER_DAYS) {
        const lastVisit = local(next.course.done[next.course.done.length - 1].startsAt);
        candidates.push(
          make("lapsed", {
            reason: `Last visit ${ago(daysBetween(lastVisit, today))}. ${
              facts.canEmail || facts.canText ? "A personal note may bring them back." : "No consent to email or text, so a call."
            }`,
            dueDate: next.latest,
            dedupeKey: `lapsed:${next.course.item.id}`,
            text: texted(
              "It's been a while since your last visit, and I wanted to check in.",
              "Whenever you'd like to pick up where you left off, reply and I'll find a time.",
            ),
            ...value,
            atRisk: true,
            draft: {
              subject: `Thinking of you, ${name}`,
              body: [
                `Hi ${name},`,
                `It's been a while since your last visit, and I wanted to check in. If now isn't the time, that's completely fine.`,
                `Whenever you'd like to pick up where you left off, reply here and I'll find a time that suits you.`,
                sign,
              ].join("\n\n"),
            },
          }),
        );
      } else if (overdue >= MISSED_AFTER_DAYS) {
        candidates.push(
          make("missed", {
            reason: `The ${session} was due ${ago(overdue)} and never booked.`,
            dueDate: next.latest,
            dedupeKey: `missed:${next.course.item.id}:${next.course.done.length + 1}`,
            text: texted(`Your ${session} isn't booked yet, and I didn't want it to slip by.`, link ? `Book here: ${link}` : "Reply and I'll hold a time."),
            ...value,
            atRisk: true,
            draft: {
              subject: `Checking in, ${name}`,
              body: [
                `Hi ${name},`,
                `I noticed we haven't booked your ${session} yet, and I didn't want it to slip by. Life gets busy, so no pressure at all.`,
                `If you'd like to keep your results moving, reply here and I'll hold a time that works for you.`,
                link ?? "",
                sign,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          }),
        );
      } else if (daysBetween(today, next.soonest) <= SESSION_REMINDER_DAYS) {
        const left = daysBetween(today, next.soonest);
        candidates.push(
          make("next_session_due", {
            reason: `The ${session} ${until(left, next.soonest)}. Not booked yet.`,
            dueDate: next.soonest,
            dedupeKey: `next_session_due:${next.course.item.id}:${next.course.done.length + 1}`,
            text: texted(`Your ${session} is coming up.`, link ? `Book here: ${link}` : "Reply and I'll hold a time."),
            ...value,
            draft: {
              subject: `Your ${session}, ${name}`,
              body: [
                `Hi ${name},`,
                `Your ${session} is coming up. Keeping to the plan's timing is what makes each session build on the last.`,
                `Reply here or book with the link below, and I'll see you then.`,
                link ?? "",
                sign,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          }),
        );
      }
    }

    // ---------- Report, no booking ----------
    const hasPlan = facts.plan && facts.plan.status !== "proposed";
    if (!hasPlan && facts.appointments.length === 0) {
      const sent = local(facts.scans[0].completedAt ?? facts.scans[0].createdAt);
      const age = daysBetween(sent, today);
      if (age >= REPORT_FOLLOW_UP_DAYS) {
        const suggested = lastScan.result
          ? buildPlan({
              result: lastScan.result!,
              intake: facts.intake,
              treatments: input.treatments,
              products: input.products,
              clinic: input.clinic,
              from: local(lastScan.createdAt),
            })
          : null;
        const lead = suggested?.focus[0];
        candidates.push(
          make("report_follow_up", {
            reason: `Report sent ${ago(age)}. Nothing booked yet.`,
            dueDate: shiftDate(sent, REPORT_FOLLOW_UP_DAYS),
            dedupeKey: "report_follow_up",
            text: link
              ? texted(`Your skin report is here whenever you're ready: ${link}`, "Questions? Just reply.")
              : texted("Any questions about your skin report? Just reply."),
            valueCents: suggested?.recommended.totalCents || null,
            valueNote: suggested?.recommended.totalCents ? "Suggested plan" : null,
            draft: {
              subject: `Your skin report, ${name}`,
              body: [
                `Hi ${name},`,
                `Thank you again for scanning with us. ${
                  lead ? `Your report points to ${concernLabel(lead.key).toLowerCase()} as the place we'd begin.` : "Your report is ready whenever you are."
                }`,
                `If you have any questions about the plan, or would like to talk it through before booking, just reply. Your report is here any time:`,
                link ?? "",
                sign,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          }),
        );
      }
    }

    // ---------- Course complete: progress scan, then maintenance ----------
    if (courseDone && upcoming.length === 0) {
      const sessions = all.flatMap((c) => c.done).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const lastSession = sessions[sessions.length - 1];
      if (lastSession) {
        const ended = local(lastSession.startsAt);
        const scanned = facts.scans.some((s) => local(s.createdAt) > ended);
        if (!scanned && daysBetween(ended, today) >= PROGRESS_SCAN_AFTER_DAYS) {
          candidates.push(
            make("progress_scan_due", {
              reason: `Course finished ${ago(daysBetween(ended, today))}. Time for a progress scan.`,
              dueDate: shiftDate(ended, PROGRESS_SCAN_AFTER_DAYS),
              dedupeKey: `progress_scan_due:${lastSession.id}`,
              text: texted(
                "Your course has had time to settle, so it's time to see what's changed.",
                link ? `Your two-minute progress scan: ${link}/rescan` : "Reply and I'll send your progress scan link.",
              ),
              valueCents: null,
              valueNote: "Scan included",
              draft: {
                subject: `Time to see your progress, ${name}`,
                body: [
                  `Hi ${name},`,
                  `Your course has had time to settle, so this is the moment to see what's changed. The progress scan takes two minutes at home, with the same steps as your first.`,
                  // Straight to the scan: the report link alone would make them look for it (D-073).
                  link ? `Start it here:\n\n${link}/rescan` : "",
                  sign,
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
            }),
          );
        }
        const due = all
          .filter((c) => c.treatment.maintenanceIntervalDays && c.done.length > 0)
          .map((c) => ({ c, date: shiftDate(local(c.done[c.done.length - 1].startsAt), c.treatment.maintenanceIntervalDays!) }))
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        if (due && daysBetween(today, due.date) <= SESSION_REMINDER_DAYS) {
          const noun = sessionNoun(due.c.treatment);
          candidates.push(
            make("maintenance_due", {
              reason: `${due.c.treatment.name} finished ${ago(daysBetween(local(due.c.done[due.c.done.length - 1].startsAt), today))}. A maintenance ${noun} is due.`,
              dueDate: due.date,
              dedupeKey: `maintenance_due:${due.c.item.id}:${due.date}`,
              text: texted(`One maintenance ${noun} now keeps the change you worked for.`, "Reply and I'll find a time that suits you."),
              valueCents: due.c.item.unitPriceCents,
              valueNote: "1 session",
              draft: {
                subject: `Keeping your results, ${name}`,
                body: [
                  `Hi ${name},`,
                  `It's been a few months since your ${inSentence(due.c.treatment.name)}. One maintenance ${noun} now keeps the change you worked for.`,
                  `Reply here and I'll find a time that suits you.`,
                  sign,
                ].join("\n\n"),
              },
            }),
          );
        }
      }
    }

    candidates.sort((a, b) => TRIGGER_ORDER.indexOf(a.kind) - TRIGGER_ORDER.indexOf(b.kind));
    return candidates[0] ?? null;
  }
}
