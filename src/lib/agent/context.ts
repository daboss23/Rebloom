// What the agent can know about one client (DECISIONS D-093), worked out in code from the same rows and rules the
// dashboard uses, and written as plain text for its tools to hand back. The agent reads; code decides: open times
// come from the booking calendar, prices from the menu, progress from the report's own verdicts on raw scores.
// Also the sets a draft is checked against, so nothing it names can be made up. Pure.

import type { Busy, OpenDay } from "@/lib/booking/slots";
import { eventBlock, openDays } from "@/lib/booking/slots";
import { nextBooking } from "@/lib/booking/next";
import { isoDateInZone } from "@/lib/clock";
import { briefFacts } from "@/lib/dashboard/brief";
import type { AgentDraftKind, Clinic, ISODate, Message, Product, Treatment } from "@/lib/domain";
import { canWriteByEmail } from "@/lib/email/opt-out";
import { BUDGET_OPTIONS, EVENT_OPTIONS, SCREENING_FLAG_TEXT, TREATMENT_OPTIONS } from "@/lib/flow/intake-options";
import { currentReading } from "@/lib/intake/goal-reading";
import { buildPlan, formatPrice, type Plan } from "@/lib/plan/build";
import { courses, priorityKeys, type ClientFacts, type QueueItem } from "@/lib/rebook/engine";
import { canAnswerByText, isReply, thread } from "@/lib/replies/thread";
import { buildProgress } from "@/lib/report/progress";
import { concernLabel, type ConcernKey } from "@/lib/skin/concerns";
import { limitLabel, skinRule } from "@/lib/skin/fitzpatrick";

export interface AgentContext {
  kind: AgentDraftKind;
  clinic: Clinic;
  /** Who the drafts are written as: "Dana". */
  staffName: string;
  now: Date;
  /** "YYYY-MM-DD" in the clinic's time zone. */
  today: ISODate;
  /** Where clients open their report: "https://www.rebloom.skin". */
  origin: string;
  /** The clinic's active menu: the only things the agent may name. */
  treatments: Treatment[];
  products: Product[];
  facts: ClientFacts;
  /** Every booked visit in the book. One treatment room, so each takes its time from everyone (D-049). */
  busy: Busy[];
  /** The reply being answered. Null for a plan review. */
  reply: Message | null;
  /** The queue item being reviewed. Null for an answer. */
  item: QueueItem | null;
  /** Which way the draft goes, decided in code from what the client agreed to. */
  channel: Message["channel"];
}

/** The way a draft can go, from consent and what the client did: the reply's own channel first. Null: neither. */
export function draftChannel(facts: ClientFacts, prefer: Message["channel"] | null): Message["channel"] | null {
  const email = canWriteByEmail({ email: facts.client.email, unsubscribedAt: facts.unsubscribedAt, messages: facts.messages });
  const text = canAnswerByText({ phone: facts.client.phone, canText: facts.canText, messages: facts.messages });
  if (prefer === "sms" && text) return "sms";
  if (email) return "email";
  return text ? "sms" : null;
}

const labelOf = <K extends string>(options: [K, string][], key: K | null | undefined) => options.find(([k]) => k === key)?.[1] ?? null;

/** "Saturday, October 17", in the clinic's time zone. */
export function dayLabel(instant: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(new Date(instant));
}

/** "10am", "2:30pm": how a person writes a time, and how a draft is checked for one. */
export function clockLabel(instant: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).formatToParts(new Date(instant));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const period = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toLowerCase();
  return `${hour}${minute === "00" ? "" : `:${minute}`}${period}`;
}

const reportLink = (ctx: AgentContext) => (ctx.facts.report ? `${ctx.origin}/r/${ctx.facts.report.token}` : null);

// ---------- The client ----------

export function describeClient(ctx: AgentContext): string {
  const { client, intake } = ctx.facts;
  const info = briefFacts(ctx.facts);
  const read = intake ? currentReading(intake) : null;
  const concerns = (intake?.concerns ?? []).filter((c) => c !== "other");
  const lines = [
    `Name: ${client.firstName}${client.lastName ? ` ${client.lastName}` : ""}${info.age ? `, age ${info.age}` : ""}.`,
    `Status: ${client.status.replace(/_/g, " ")}.`,
    intake?.goalText ? `Their goal, in their own words: "${intake.goalText}"` : "They didn't write a goal in their own words.",
    read?.length ? `Their words read as: ${read.map((r) => `${concernLabel(r.key).toLowerCase()} ("${r.phrase}")`).join(", ")}.` : null,
    concerns.length ? `Concerns they ticked: ${concerns.map((c) => c.replace(/_/g, " ")).join(", ")}.` : null,
    intake?.hasEvent && intake.eventDate
      ? `Event: ${labelOf(EVENT_OPTIONS, intake.eventType) ?? "an event"} on ${dayLabel(`${intake.eventDate}T12:00:00Z`, "UTC")}.`
      : "No event coming up that they told us about.",
    `Budget: ${labelOf(BUDGET_OPTIONS, intake?.budgetBand) ?? "not given"}.`,
    `Past treatments: ${(intake?.pastTreatments ?? []).map((t) => labelOf(TREATMENT_OPTIONS, t)).filter(Boolean).join(", ") || "none"}.`,
    info.flags.length
      ? `Screening answers for ${ctx.staffName} to review in person (prompts for her judgement, never something to advise on in writing): ${info.flags.join(" ")}`
      : "No screening answers to review.",
    client.fitzpatrick
      ? `Skin type for ${ctx.staffName} only, never to mention in writing: Fitzpatrick ${client.fitzpatrick.type}, ${client.fitzpatrick.source === "practitioner" ? "confirmed by the clinic" : "estimated from their scan"}. Treatments the clinic doesn't offer to this type are left out of their plan; never suggest one.`
      : null,
    ...(client.skinTypeExceptions ?? []).map((e) => {
      const name = ctx.treatments.find((t) => t.id === e.treatmentId)?.name;
      return name ? `${e.by} offers them ${name} anyway, her call: "${e.reason}". It may be suggested.` : null;
    }),
    ctx.facts.report?.practitionerNote ? `${ctx.staffName}'s note on their report: "${ctx.facts.report.practitionerNote}"` : null,
    `This draft goes by ${ctx.channel === "sms" ? "text" : "email"}.`,
  ];
  return lines.filter(Boolean).join("\n");
}

// ---------- The conversation ----------

/** How many of the latest messages the agent reads: enough for context, short enough to stay on the point. */
export const CONVERSATION_SHOWN = 10;

export function describeConversation(ctx: AgentContext): string {
  const tz = ctx.clinic.timezone;
  const name = ctx.facts.client.firstName ?? "The client";
  const entries = thread(ctx.facts.messages, ctx.facts.client).slice(-CONVERSATION_SHOWN);
  if (entries.length === 0) return "No messages yet.";
  const waiting = ctx.reply?.id;
  return entries
    .map((e) => {
      const when = `${dayLabel(e.at, tz)}, ${clockLabel(e.at, tz)}`;
      const how = e.channel === "sms" ? "text" : "email";
      if (e.side === "note") return `[${when}] Note: ${e.body}`;
      const who = e.side === "client" ? name : e.automatic ? `${ctx.clinic.name} (sent automatically)` : ctx.staffName;
      const mark = e.id === waiting ? " (WAITING ON AN ANSWER: this is the one to answer)" : "";
      return `[${when}] ${who}, by ${how}${e.subject && e.side !== "client" ? `, "${e.subject}"` : ""}${mark}:\n<message>\n${e.body}\n</message>`;
    })
    .join("\n\n");
}

// ---------- Scans and progress ----------

export function describeScans(ctx: AgentContext): string {
  const { scans } = ctx.facts;
  const tz = ctx.clinic.timezone;
  if (scans.length === 0) return "No scans yet.";
  const keys = priorityKeys(ctx.facts);
  const first = scans[0];
  const lines = [
    `${scans.length} ${scans.length === 1 ? "scan" : "scans"}: ${scans.map((s) => `scan ${String(s.scanNumber).padStart(2, "0")} on ${dayLabel(s.createdAt, tz)}`).join("; ")}.`,
    `Priorities from the first scan: ${keys.map((k) => concernLabel(k).toLowerCase()).join(", ")}.`,
    `Scores the client sees (out of 100, higher is better) on the first scan: ${keys
      .map((k) => `${concernLabel(k).toLowerCase()} ${first.result!.concerns.find((c) => c.key === k)?.ui ?? "?"}`)
      .join(", ")}.`,
  ];
  const progress = buildProgress(scans, keys);
  if (progress) {
    lines.push(
      `Since the first scan (${progress.weeks} weeks), judged on the underlying measurement as the client's report does:`,
      ...progress.items.map(
        (i) =>
          `- ${i.label}: ${i.from} to ${i.to} on screen. Verdict: ${i.verdict}.${
            i.verdict === "improved" || i.verdict === "improving" ? ` You may say it is up ${i.uiDelta} points.` : " Don't claim a change here."
          } The report says: "${i.line}"`,
      ),
      progress.confident ? "The scans were compared like with like." : "The latest scan can't be compared with the first (different light or engine).",
    );
  } else {
    lines.push("Only one scan, so there's no progress to speak of yet.");
  }
  return lines.join("\n");
}

// ---------- The plan ----------

/** The plan their latest report suggests, before anything is agreed. Null without a scan. */
export function suggested(ctx: AgentContext): Plan | null {
  const scan = ctx.facts.scans[ctx.facts.scans.length - 1];
  if (!scan?.result) return null;
  return buildPlan({
    result: scan.result,
    intake: ctx.facts.intake,
    treatments: ctx.treatments,
    products: ctx.products,
    clinic: ctx.clinic,
    from: isoDateInZone(new Date(scan.createdAt), ctx.clinic.timezone),
    skin: skinRule(ctx.facts.client),
  });
}

export function describePlan(ctx: AgentContext): string {
  const tz = ctx.clinic.timezone;
  const upcoming = ctx.facts.appointments.filter((a) => a.status === "booked" && Date.parse(a.startsAt) > ctx.now.getTime());
  const nameOf = (id: string | null) => ctx.treatments.find((t) => t.id === id)?.name ?? "First consultation";
  const lines: string[] = [];
  if (upcoming.length) {
    lines.push(`Booked: ${upcoming.map((a) => `${nameOf(a.treatmentId)} on ${dayLabel(a.startsAt, tz)} at ${clockLabel(a.startsAt, tz)}`).join("; ")}.`);
  } else {
    lines.push("Nothing booked.");
  }
  if (ctx.facts.plan) {
    const status = ctx.facts.plan.status === "proposed" ? "proposed (not confirmed yet)" : ctx.facts.plan.status;
    lines.push(`Their plan is ${status}. Total ${formatPrice(ctx.facts.plan.totalCents)}.`);
    for (const c of courses(ctx.facts, ctx.treatments)) {
      lines.push(
        `- ${c.treatment.name}: ${c.item.quantity} sessions at ${formatPrice(c.item.unitPriceCents)} each. ${c.done.length} done, ${c.booked.length} booked, ${c.unbooked} still to book.`,
      );
    }
    const home = ctx.facts.plan.items.filter((i) => i.productId);
    if (home.length) lines.push(`Home care: ${home.map((i) => ctx.products.find((p) => p.id === i.productId)?.name ?? "a product").join(", ")}.`);
    return lines.join("\n");
  }
  const plan = suggested(ctx);
  if (!plan) return `${lines[0]}\nNo plan yet.`;
  lines.push(
    "No plan agreed yet. Their report suggests:",
    ...plan.recommended.lines.map(
      (l) => `- ${l.treatment.name}: ${l.sessions} ${l.sessions === 1 ? "session" : "sessions"} at ${formatPrice(l.treatment.priceCents)} each, ${formatPrice(l.totalCents)}. Works on ${l.covers.map((k) => concernLabel(k).toLowerCase()).join(" and ")}.`,
    ),
    `Total ${formatPrice(plan.recommended.totalCents)}.`,
  );
  if (plan.withinBudget) {
    lines.push(`It is above their budget, so the report also offers a lighter plan at ${formatPrice(plan.withinBudget.totalCents)}: ${plan.withinBudget.lines.map((l) => `${l.treatment.name} x${l.sessions}`).join(", ")}.`);
  }
  if (plan.homeCare.length) lines.push(`Home care on the report: ${plan.homeCare.map((h) => `${h.product.name} (${formatPrice(h.product.priceCents)})`).join(", ")}.`);
  const firstSession = plan.timeline.find((s) => s.kind === "session");
  if (firstSession) lines.push(`The report's timeline starts the week of ${dayLabel(`${firstSession.date}T12:00:00Z`, "UTC")}.`);
  return lines.join("\n");
}

// ---------- The menu ----------

export function describeMenu(ctx: AgentContext): string {
  const t = ctx.treatments.map((x) =>
    [
      `- ${x.name}: ${formatPrice(x.priceCents)} a session.`,
      x.sessionsTypical ? `Usually ${x.sessionsTypical} sessions, ${x.intervalDaysMin === x.intervalDaysMax ? `${x.intervalDaysMin} days` : `${x.intervalDaysMin} to ${x.intervalDaysMax} days`} apart.` : `Ongoing, every ${x.intervalDaysMin} days or so.`,
      `${x.durationMinutes} minutes.`,
      x.downtimeDays === 0 ? "No downtime." : `Visible downtime about ${x.downtimeDays} ${x.downtimeDays === 1 ? "day" : "days"}.`,
      x.minDaysBeforeEvent > 0 ? `Not within ${x.minDaysBeforeEvent} days before an event.` : null,
      limitLabel(x.fitzpatrickMax) ? `Offered to skin ${limitLabel(x.fitzpatrickMax)} only.` : null,
      `Works on ${x.concerns.map((k) => concernLabel(k).toLowerCase()).join(", ")}.`,
      x.description,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const p = ctx.products.map((x) => `- ${x.name}: ${formatPrice(x.priceCents)}. ${x.description}`);
  return [`${ctx.clinic.name}'s treatments:`, ...t, "", "Products for home care:", ...p, "", `Booking takes a refundable deposit of ${formatPrice(ctx.clinic.depositCents)} when deposits are on.`].join("\n");
}

// ---------- Open times ----------

export type PartOfDay = "morning" | "afternoon" | "evening" | "any";
export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** How many times the tool hands back: a few real choices, not a calendar. */
export const OPEN_TIMES_SHOWN = 6;

export interface OpenTimes {
  text: string;
  /** Every time handed back, as ISO instants. */
  offered: string[];
}

/**
 * The next visit this client can book from their own link, and open times for it that suit what they asked for.
 * The same rules as the booking page: the clinic's hours, the treatment's length, what's booked, their event.
 */
export function findOpenTimes(ctx: AgentContext, want: { weekdays?: Weekday[]; partOfDay?: PartOfDay; fromDate?: string }): OpenTimes {
  const tz = ctx.clinic.timezone;
  const plan = ctx.facts.plan && (ctx.facts.plan.status === "proposed" || ctx.facts.plan.status === "confirmed") ? ctx.facts.plan : null;
  const { upcoming, target } = nextBooking({
    plan,
    suggested: plan ? null : suggested(ctx),
    appointments: ctx.facts.appointments,
    treatments: ctx.treatments,
    now: ctx.now,
    today: ctx.today,
    timeZone: tz,
  });
  if (upcoming) {
    const t = ctx.treatments.find((x) => x.id === upcoming.treatmentId);
    return { text: `They already have a visit booked: ${t?.name ?? "a first consultation"} on ${dayLabel(upcoming.startsAt, tz)} at ${clockLabel(upcoming.startsAt, tz)}. One visit is booked at a time, so there's nothing else to offer until then.`, offered: [] };
  }
  if (!target) return { text: "There's no visit for them to book from their link right now.", offered: [] };

  const from = want.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(want.fromDate) && want.fromDate > target.earliest ? want.fromDate : target.earliest;
  const days: OpenDay[] = openDays({
    clinic: ctx.clinic,
    durationMinutes: target.treatment.durationMinutes,
    from,
    now: ctx.now,
    busy: ctx.busy,
    blocked: eventBlock(ctx.facts.intake?.eventDate ?? null, target.treatment.minDaysBeforeEvent),
    maxDays: 30,
    horizonDays: 60,
  });
  const weekdays = want.weekdays?.length ? new Set(want.weekdays.map((d) => WEEKDAYS.indexOf(d))) : null;
  const hourOf = (iso: string) => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date(iso)));
  const fits = (iso: string) => {
    const h = hourOf(iso);
    return want.partOfDay === "morning" ? h < 12 : want.partOfDay === "afternoon" ? h >= 12 && h < 17 : want.partOfDay === "evening" ? h >= 17 : true;
  };
  const picked: string[] = [];
  for (const day of days) {
    if (weekdays && !weekdays.has(new Date(`${day.date}T12:00:00Z`).getUTCDay())) continue;
    // Two a day at most, so a handful of times spans more than one day.
    for (const slot of day.slots.filter((s) => fits(s.startsAt)).slice(0, 2)) picked.push(slot.startsAt);
    if (picked.length >= OPEN_TIMES_SHOWN) break;
  }
  const visit = `${target.treatment.name}${target.session && target.of ? `, session ${target.session} of ${target.of}` : target.reason === "maintenance" ? ", a maintenance visit" : ""}`;
  const link = reportLink(ctx);
  const hours = Object.entries(ctx.clinic.hours.days)
    .map(([d, h]) => `${WEEKDAYS[Number(d)]} ${h!.open} to ${h!.close}`)
    .join(", ");
  if (picked.length === 0) {
    return {
      text: `The visit they can book is ${visit} (${target.treatment.durationMinutes} minutes), from ${dayLabel(`${target.earliest}T12:00:00Z`, "UTC")}. No open times match that in the next few weeks. The clinic is open ${hours}.`,
      offered: [],
    };
  }
  return {
    text: [
      `The visit they can book is ${visit} (${target.treatment.durationMinutes} minutes). It can't be earlier than ${dayLabel(`${target.earliest}T12:00:00Z`, "UTC")}.`,
      "Open right now (they can still be taken by someone else, so offer them, never promise to hold one):",
      ...picked.map((iso) => `- ${dayLabel(iso, tz)} at ${clockLabel(iso, tz)}`),
      link ? `They book it themselves here, choosing the time on the page: ${link}/book` : "They have no report link, so they'd book by replying.",
    ].join("\n"),
    offered: picked,
  };
}

// ---------- What a draft may name ----------

/** Every amount a draft may quote, in whole dollars: menu prices, course totals, plan totals, the deposit. */
export function allowedPrices(ctx: AgentContext, extraCents: number[] = []): Set<number> {
  const cents = [
    ctx.clinic.depositCents,
    ...ctx.treatments.flatMap((t) => [t.priceCents, ...Array.from({ length: t.sessionsTypical ?? 6 }, (_, i) => t.priceCents * (i + 1))]),
    ...ctx.products.map((p) => p.priceCents),
    ...extraCents,
  ];
  if (ctx.facts.plan) {
    cents.push(ctx.facts.plan.totalCents, ...ctx.facts.plan.items.map((i) => i.unitPriceCents * i.quantity));
  } else {
    const plan = suggested(ctx);
    if (plan) {
      cents.push(plan.recommended.totalCents, ...plan.recommended.lines.map((l) => l.totalCents));
      if (plan.withinBudget) cents.push(plan.withinBudget.totalCents, ...plan.withinBudget.lines.map((l) => l.totalCents));
      cents.push(plan.recommended.totalCents + plan.homeCare.reduce((n, h) => n + h.product.priceCents, 0));
    }
  }
  return new Set(cents.map((c) => Math.round(c / 100)));
}

/** Times a draft may name: ones checked open in this run, their booked visits, and any the client wrote themselves. */
export function allowedTimes(ctx: AgentContext, offered: string[]): Set<string> {
  const tz = ctx.clinic.timezone;
  const booked = ctx.facts.appointments.filter((a) => a.status === "booked").map((a) => a.startsAt);
  const said = ctx.facts.messages.filter(isReply).flatMap((m) => timesIn(m.body));
  return new Set([...[...offered, ...booked].map((iso) => clockLabel(iso, tz)), ...said]);
}

/** "10am", "2:30pm" mentions in a text, normalised. "10:00 AM" reads as "10am". */
export function timesIn(text: string): string[] {
  return [...text.matchAll(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s?(a\.?m\.?|p\.?m\.?)(?![a-z])/gi)].map(
    (m) => `${Number(m[1])}${m[2] && m[2] !== "00" ? `:${m[2]}` : ""}${m[3].replace(/\./g, "").toLowerCase()}`,
  );
}

// After a number, these say it isn't a time: "for 3 weeks", "from 1 to 3", "after 2 sessions".
const NOT_A_TIME = String.raw`(?:-|to|and|or|of|x|%|days?|weeks?|months?|years?|sessions?|minutes?|mins?|hours?|hrs?|points?|percent|times?|people|products?|treatments?|visits?|scans?|nights?|parts?|texts?|more)\b`;
const BARE_CLOCK = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s?(?:a\.?m\.?|p\.?m\.?)(?![a-z]))/gi;
const BARE_HOUR = new RegExp(
  String.raw`\b(?:at|for|from|by|until|till|til|around|after|before|about)\s+(?:1[0-2]|[1-9])\b(?!:\d)(?!\s?(?:a\.?m\.?|p\.?m\.?)(?![a-z]))(?!\s*${NOT_A_TIME})`,
  "gi",
);

/**
 * Times written without am or pm: "10:45", "16:00", "at 10", "in for 10?". A US client reads "10" two ways, so every
 * time a draft names says which (Joshua, Oct 12).
 */
export function bareTimesIn(text: string): string[] {
  return [...[...text.matchAll(BARE_CLOCK)].map((m) => m[0]), ...[...text.matchAll(BARE_HOUR)].map((m) => m[0])];
}

/** Dollar amounts in a text, in whole dollars. */
export function pricesIn(text: string): number[] {
  return [...text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g)].map((m) => Number(m[1].replace(/,/g, "")) + Number(m[2] ?? 0) / 100);
}

/**
 * Points of progress a draft may claim: only a change the report itself calls improved or improving, measured on the
 * raw scores like with like, in the points the client sees (D-097). "Up 6 points" must be one of these.
 */
export function allowedPoints(ctx: AgentContext): Set<number> {
  const progress = buildProgress(ctx.facts.scans, priorityKeys(ctx.facts));
  if (!progress?.confident) return new Set();
  return new Set(progress.items.filter((i) => i.verdict === "improved" || i.verdict === "improving").map((i) => i.uiDelta));
}

/** "6 points", "up 12 pts": the numbers of points a text claims. */
export function pointsIn(text: string): number[] {
  return [...text.matchAll(/\b(\d{1,3})\s?(?:points?|pts?)\b/gi)].map((m) => Number(m[1]));
}

/** Links a draft may carry: the client's own report, booking and rescan pages. */
export function allowedLink(ctx: AgentContext, url: string): boolean {
  const base = reportLink(ctx);
  if (!base) return false;
  const clean = url.replace(/[).,;:!?]+$/, "");
  return clean === base || clean === `${base}/book` || clean === `${base}/rescan`;
}

/** The plan's treatment that a change would take over from: the course still under way, else the first on the plan. */
export function currentCourse(ctx: AgentContext): Treatment | null {
  const all = courses(ctx.facts, ctx.treatments);
  return (all.find((c) => c.unbooked > 0 || c.booked.length > 0) ?? all[0])?.treatment ?? null;
}

/** Screening answers that bear on one treatment: prompts for Dana, never decisions (brief 8.3). */
export function flagsFor(ctx: AgentContext, treatment: Treatment): string[] {
  const screening = ctx.facts.intake?.screening ?? {};
  return treatment.screeningFlags
    .filter((k) => screening[k] === "yes" || screening[k] === "unsure")
    .map((k) => `${SCREENING_FLAG_TEXT[k]}${screening[k] === "unsure" ? " (Answered unsure.)" : ""}`);
}

export type { ConcernKey };
