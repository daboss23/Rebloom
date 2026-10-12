import "server-only";
// One sandbox's copy of the demo clients (DECISIONS D-014, D-049), as rows ready to store.
// Pure apart from fresh ids and report tokens: the same cast, clinic and "today" give the same story.

import { DEMO_CLIENTS, type DemoClient, type DemoVisit } from "@/data/demo-clients";
import { hasDemoLandmarks } from "@/lib/demo/landmarks";
import { CONSENT_VERSION, TEXTS_CONSENT_VERSION } from "@/lib/flow/consent";
import type {
  Appointment,
  Client,
  ClientPlan,
  Clinic,
  Consent,
  ConsentType,
  ISODate,
  Intake,
  Message,
  PlanItem,
  Product,
  Report,
  Scan,
  Staff,
  Treatment,
} from "@/lib/domain";
import { zonedDateTime } from "@/lib/clock";
import { newId, newToken, stableId } from "@/lib/ids";
import { nextOpenDay, shiftDate } from "@/lib/plan/build";
import { ANSWER_TYPE, REPLY_TYPE, inboundKey, replySubject } from "@/lib/replies/thread";
import { SCORED_CONCERNS } from "@/lib/skin/concerns";
import { normalizeResult } from "@/lib/skin/normalize";
import { SHARED_DEMO_PREFIX, demoMaskPath } from "@/lib/store/scan-paths";
import { FIXTURE_PROFILES, rawFromUi } from "@/lib/youcam/fixture";
import type { RawSkinResult } from "@/lib/youcam/types";

export interface DemoBundle {
  clients: Client[];
  consents: Consent[];
  intakes: Intake[];
  scans: Scan[];
  reports: Report[];
  plans: ClientPlan[];
  planItems: PlanItem[];
  appointments: Appointment[];
  messages: Message[];
}

export interface DemoInput {
  clinic: Clinic;
  treatments: Treatment[];
  products: Product[];
  staff: Staff[];
  sandboxId: string;
  /** The sandbox's "today" in the clinic's time zone, "YYYY-MM-DD". Every date counts from here. */
  today: ISODate;
  cast?: DemoClient[];
}

/** A first consult is a half-hour visit. */
export const CONSULT_MINUTES = 30;
/** Clients scan at home, in the evening. */
const SCAN_TIME = "19:30";

/** Shared, read-only portraits (DECISIONS D-030). Every copy of a demo client points at the same file. */
export function demoPortraitPath(key: string): string {
  return `${SHARED_DEMO_PREFIX}portraits/${key}.jpg`;
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The last open day on or before `iso`. */
function previousOpenDay(iso: string, hours: Clinic["hours"]): string {
  const open = Object.keys(hours.days).map(Number);
  let day = iso;
  for (let i = 0; i < 7 && !open.includes(new Date(`${day}T12:00:00Z`).getUTCDay()); i++) day = shiftDate(day, -1);
  return day;
}

const dayOfWeek = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Places visits on the clinic's calendar. Past visits move back to an open day and future ones forward,
 * so nothing crosses "today". A clash with a visit already placed moves to the next free slot that day,
 * then to the next open day in the same direction. One treatment room (D-049): visits never overlap.
 */
class Calendar {
  private taken = new Map<string, [number, number][]>();
  constructor(
    private readonly hours: Clinic["hours"],
    private readonly today: string,
  ) {}

  place(day: number, time: string, minutes: number): { date: string; time: string } {
    const back = day < 0;
    let date = shiftDate(this.today, day);
    date = back ? previousOpenDay(date, this.hours) : nextOpenDay(date, this.hours);
    let start = toMinutes(time);
    for (let guard = 0; guard < 400; guard++) {
      const open = this.hours.days[dayOfWeek(date)]!;
      const [opens, closes] = [toMinutes(open.open), toMinutes(open.close)];
      start = Math.max(start, opens);
      const busy = this.taken.get(date) ?? [];
      const clash = busy.some(([s, e]) => start < e && s < start + minutes);
      if (!clash && start + minutes <= closes) {
        this.taken.set(date, [...busy, [start, start + minutes]]);
        return { date, time: toTime(start) };
      }
      if (start + this.hours.slotMinutes + minutes <= closes) {
        start += this.hours.slotMinutes;
        continue;
      }
      date = back ? previousOpenDay(shiftDate(date, -1), this.hours) : nextOpenDay(shiftDate(date, 1), this.hours);
      start = opens;
    }
    throw new Error("No free slot for a demo visit.");
  }
}

function scanResult(client: DemoClient, upTo: number): RawSkinResult {
  const ui: Record<string, number> = { ...FIXTURE_PROFILES[client.profile].ui };
  for (const scan of client.scans.slice(0, upTo + 1)) Object.assign(ui, scan.ui);
  const raw: RawSkinResult = { concerns: {}, skin_age: client.skinAge, skin_type: client.skinType, engine: "sd" };
  for (const key of SCORED_CONCERNS) raw.concerns[key] = { ui_score: ui[key], raw_score: rawFromUi(ui[key]) };
  raw.all = Math.round(SCORED_CONCERNS.reduce((n, k) => n + ui[k], 0) / SCORED_CONCERNS.length);
  return raw;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const iso = (t: number) => new Date(t).toISOString();

export function buildDemoBundle(input: DemoInput): DemoBundle {
  const { clinic, sandboxId, today } = input;
  const cast = input.cast ?? DEMO_CLIENTS;
  const at = (date: string, time: string) => zonedDateTime(date, time, clinic.timezone).getTime();
  const practitioner = input.staff.find((s) => s.clinicId === clinic.id && s.role === "practitioner") ?? null;
  const treatment = (key: string) => {
    const t = input.treatments.find((t) => t.id === stableId(`treatment:${clinic.slug}:${key}`));
    if (!t) throw new Error(`The ${clinic.name} menu has no ${key}.`);
    return t;
  };
  const product = (key: string) => {
    const p = input.products.find((p) => p.id === stableId(`product:${clinic.slug}:${key}`));
    if (!p) throw new Error(`The ${clinic.name} shelf has no ${key}.`);
    return p;
  };
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: clinic.timezone,
  });

  const calendar = new Calendar(clinic.hours, today);
  const bundle: DemoBundle = {
    clients: [],
    consents: [],
    intakes: [],
    scans: [],
    reports: [],
    plans: [],
    planItems: [],
    appointments: [],
    messages: [],
  };
  const todayStarts = at(today, "00:00");

  cast.forEach((demo, index) => {
    const clientId = newId();
    const scanTimes = demo.scans.map((s, i) => at(shiftDate(today, s.day), SCAN_TIME) + i * 60_000);
    const joined = scanTimes[0] - 12 * 60_000;

    const client: Client = {
      id: clientId,
      clinicId: clinic.id,
      sandboxId,
      firstName: demo.firstName,
      lastName: demo.lastName,
      // example.com never delivers: demo clients can't be emailed by mistake.
      email: `${demo.firstName}.${demo.lastName}@example.com`.toLowerCase(),
      phone: `${clinic.phone.slice(0, 5)} 555-02${String(index + 10).padStart(2, "0")}`,
      ageRange: demo.ageRange,
      status: demo.status,
      isDemo: true,
      demoKey: demo.key,
      // As if YouCam had read it from their first scan (D-094).
      fitzpatrick: { type: demo.fitzpatrick, source: "scan", at: iso(scanTimes[0] + 30_000), scanId: null },
      createdAt: iso(joined),
    };
    bundle.clients.push(client);

    const types: ConsentType[] = ["biometric", ...(demo.reminders ? (["reminders"] as const) : []), ...(demo.texts ? (["texts"] as const) : [])];
    for (const type of types) {
      bundle.consents.push({
        id: newId(),
        clientId,
        type,
        grantedAt: iso(joined + 60_000),
        textVersion: type === "texts" ? TEXTS_CONSENT_VERSION : CONSENT_VERSION,
        ipHash: null,
        userAgent: null,
      });
    }

    const { intake } = demo;
    bundle.intakes.push({
      clientId,
      concerns: intake.concerns,
      concernsOther: null,
      goalText: intake.goalText,
      hasEvent: intake.event !== null,
      eventType: intake.event?.type ?? null,
      eventDate: intake.event ? shiftDate(today, intake.event.day) : null,
      pastTreatments: intake.pastTreatments,
      budgetBand: intake.budgetBand,
      screening: intake.screening,
      sensitivitiesNote: intake.screening.sensitivities === "yes" ? "Gets irritated easily, especially after shaving." : null,
      completedAt: iso(joined + 6 * 60_000),
      updatedAt: iso(joined + 6 * 60_000),
    });

    // The face found on the portrait (scripts/demo-landmarks.mjs) gives demo face maps their marks (D-070).
    const marked = hasDemoLandmarks(demo.key);
    const scans: Scan[] = demo.scans.map((_, i) => {
      const raw = scanResult(demo, i);
      const result = normalizeResult(raw);
      if (marked) for (const c of result.concerns) c.maskPath = demoMaskPath(demo.key, i + 1, c.key);
      return {
        id: newId(),
        clientId,
        sandboxId,
        scanNumber: i + 1,
        status: "complete",
        source: "fixture",
        imagePath: demoPortraitPath(demo.key),
        imageWidth: 1080,
        imageHeight: 1440,
        captureQuality: null,
        landmarks: null,
        concernsRequested: [...SCORED_CONCERNS],
        providerTaskId: null,
        analysisStartedAt: iso(scanTimes[i] + 5_000),
        errorCode: null,
        youcamRaw: raw,
        result,
        comparisonConfidence: i === 0 ? null : "high",
        createdAt: iso(scanTimes[i]),
        completedAt: iso(scanTimes[i] + 45_000),
      };
    });
    bundle.scans.push(...scans);
    const lastScan = scans[scans.length - 1];

    const report: Report = {
      id: newId(),
      clientId,
      token: newToken(),
      content: null,
      practitionerNote: demo.note,
      version: 1,
      updatedAt: lastScan.completedAt!,
    };
    bundle.reports.push(report);

    // ---------- Visits ----------
    const visits = demo.visits.map((visit: DemoVisit) => {
      const t = visit.treatment === "consult" ? null : treatment(visit.treatment);
      const minutes = t?.durationMinutes ?? CONSULT_MINUTES;
      const slot = calendar.place(visit.day, visit.time, minutes);
      const startsAt = at(slot.date, slot.time);
      return { visit, treatment: t, startsAt, endsAt: startsAt + minutes * 60_000, past: slot.date < today };
    });

    // ---------- Plan ----------
    const itemFor = new Map<string, string>();
    if (demo.plan) {
      const planId = newId();
      const planned = (t: Treatment) => visits.filter((v) => v.visit.planned && v.treatment?.id === t.id);
      const items: PlanItem[] = [
        ...demo.plan.treatments.map(({ key, sessions }, position) => {
          const t = treatment(key);
          const first = planned(t)[0];
          return {
            id: newId(),
            planId,
            treatmentId: t.id,
            productId: null,
            quantity: sessions,
            unitPriceCents: t.priceCents,
            position,
            targetDate: first ? new Intl.DateTimeFormat("en-CA", { timeZone: clinic.timezone }).format(first.startsAt) : null,
          };
        }),
        ...demo.plan.products.map((key, i) => {
          const p = product(key);
          return {
            id: newId(),
            planId,
            treatmentId: null,
            productId: p.id,
            quantity: 1,
            unitPriceCents: p.priceCents,
            position: demo.plan!.treatments.length + i,
            targetDate: null,
          };
        }),
      ];
      for (const item of items) if (item.treatmentId) itemFor.set(item.treatmentId, item.id);
      const madeAt = at(shiftDate(today, demo.plan.day), "12:00");
      const confirmed = demo.plan.status !== "proposed";
      bundle.plans.push({
        id: planId,
        clientId,
        scanId: scans.filter((s) => Date.parse(s.createdAt) <= madeAt).pop()?.id ?? scans[0].id,
        status: demo.plan.status,
        confirmedBy: confirmed ? (practitioner?.id ?? null) : null,
        confirmedAt: confirmed ? iso(madeAt) : null,
        totalCents: items.reduce((n, i) => n + i.quantity * i.unitPriceCents, 0),
        createdAt: iso(madeAt),
      });
      bundle.planItems.push(...items);
    }

    // ---------- Appointments, and the messages they sent ----------
    const send = (m: Pick<Message, "type" | "subject" | "body" | "dedupeKey">, sentAt: number) =>
      bundle.messages.push({
        id: newId(),
        clinicId: clinic.id,
        clientId,
        sandboxId,
        channel: "email",
        status: "sent",
        scheduledFor: null,
        sentAt: iso(sentAt),
        createdAt: iso(sentAt),
        ...m,
      });

    send(
      {
        type: "report_link",
        subject: `Your skin report from ${clinic.name}`,
        body: `Hi ${demo.firstName}, your skin report is ready. Open it any time: /r/${report.token}`,
        dedupeKey: "report_link",
      },
      Date.parse(scans[0].completedAt!) + 60_000,
    );

    [...visits]
      .sort((a, b) => a.startsAt - b.startsAt)
      .forEach((v, n) => {
        // Booked a few weeks ahead at most, never before the first scan, and never after today.
        const bookedAt = Math.min(Math.max(scanTimes[0] + DAY_MS, v.startsAt - 21 * DAY_MS), v.startsAt - HOUR_MS, todayStarts);
        const appointment: Appointment = {
          id: newId(),
          clinicId: clinic.id,
          clientId,
          sandboxId,
          kind: v.treatment ? "treatment" : "consult",
          treatmentId: v.treatment?.id ?? null,
          planItemId: v.visit.planned && v.treatment ? (itemFor.get(v.treatment.id) ?? null) : null,
          staffId: practitioner?.id ?? null,
          startsAt: iso(v.startsAt),
          endsAt: iso(v.endsAt),
          status: v.past ? "completed" : "booked",
          // The deposit is taken when the first visit is booked (Week 2 booking).
          depositCents: n === 0 ? clinic.depositCents : 0,
          depositStatus: n === 0 && clinic.depositCents > 0 ? "paid" : "none",
          depositPaymentIntent: null,
          createdAt: iso(bookedAt),
        };
        bundle.appointments.push(appointment);
        send(
          {
            type: "booking_confirmation",
            subject: `You're booked: ${v.treatment?.name ?? "First consultation"}`,
            body: `Hi ${demo.firstName}, you're booked for ${v.treatment?.name ?? "your first consultation"} on ${when.format(v.startsAt)}. ${clinic.address}.`,
            dedupeKey: `booking_confirmation:${appointment.id}`,
          },
          bookedAt,
        );
      });

    // ---------- Their conversation (D-081) ----------
    // Seeded replies carry no sender: only a reply that really arrived has one (it decides who a demo answer reaches).
    const fill = (text: string) => text.replaceAll("{practitioner}", practitioner?.name ?? clinic.name).replaceAll("{clinic}", clinic.name);
    (demo.conversation ?? []).forEach((line, n) => {
      const sentAt = at(shiftDate(today, line.day), line.time);
      const lastEmail = bundle.messages
        .filter((m) => m.clientId === clientId && m.channel === "email" && m.subject && Date.parse(m.createdAt) <= sentAt)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .pop();
      const fromClient = line.from === "client";
      bundle.messages.push({
        id: newId(),
        clinicId: clinic.id,
        clientId,
        sandboxId,
        type: fromClient ? REPLY_TYPE : (line.type ?? ANSWER_TYPE),
        channel: line.channel,
        subject: line.channel === "email" ? replySubject(lastEmail?.subject, `A note from ${clinic.name}`) : null,
        body: fill(line.body),
        status: fromClient ? "received" : "sent",
        dedupeKey: fromClient ? inboundKey(`demo-${demo.key}-${n}`) : `demo_line:${n}`,
        scheduledFor: null,
        sentAt: iso(sentAt),
        createdAt: iso(sentAt),
      });
    });
  });

  return bundle;
}

