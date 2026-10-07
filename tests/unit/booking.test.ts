import { beforeAll, describe, expect, it, vi } from "vitest";

// Before any import: the emails import the store, and the store picks its data folder as it loads.
await vi.hoisted(async () => {
  const [{ mkdtempSync }, os, path] = await Promise.all([import("node:fs"), import("node:os"), import("node:path")]);
  process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-booking-"));
});

import { MAISON_VERRE } from "@/data/clinics";
import { SEED_TREATMENTS } from "@/data/menu";
import type { Appointment, Treatment } from "@/lib/domain";
import { checkCopy } from "@/lib/copy/check";
import { bookingCancelledEmail, bookingConfirmationEmail, visitInvite, visitWhen } from "@/lib/email/booking";
import { nextBooking } from "@/lib/booking/next";
import { eventBlock, isOpen, openDays } from "@/lib/booking/slots";
import type { Plan } from "@/lib/plan/build";
import type { PlanWithItems } from "@/lib/store/types";

const clinic = MAISON_VERRE; // Tuesday to Saturday, 10:00 to 18:00, Los Angeles
const treatment = (name: string): Treatment => SEED_TREATMENTS.find((t) => t.clinicId === clinic.id && t.name === name)!;
const microneedling = treatment("Microneedling"); // 60 minutes, every 28 to 42 days, maintenance 180
const peel = treatment("Signature Peel Series"); // 45 minutes, every 21 days
// Monday October 12, 2026, 9:00 in Los Angeles (UTC-7).
const monday = new Date("2026-10-12T16:00:00Z");

const visit = (over: Partial<Appointment>): Appointment => ({
  id: crypto.randomUUID(),
  clinicId: clinic.id,
  clientId: "client",
  sandboxId: "sb",
  kind: "treatment",
  treatmentId: microneedling.id,
  planItemId: null,
  staffId: null,
  startsAt: "2026-10-13T18:00:00.000Z",
  endsAt: "2026-10-13T19:00:00.000Z",
  status: "booked",
  depositCents: 0,
  depositStatus: "none",
  depositPaymentIntent: null,
  createdAt: monday.toISOString(),
  ...over,
});

describe("open times (DECISIONS D-065)", () => {
  it("offers only the clinic's open days, every half hour that fits before closing", () => {
    const days = openDays({ clinic, durationMinutes: 60, from: "2026-10-12", now: monday, busy: [] });
    // Monday is closed: the first day is Tuesday. Sunday and Monday never appear.
    expect(days[0].date).toBe("2026-10-13");
    expect(days.map((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay())).not.toContain(0);
    expect(days.map((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay())).not.toContain(1);
    // 10:00 to 17:00 for an hour-long visit: 15 starts.
    expect(days[0].slots.map((s) => s.time)).toEqual(
      ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"],
    );
    expect(days[0].slots[0].startsAt).toBe("2026-10-13T17:00:00.000Z");
    expect(days).toHaveLength(10);
  });

  it("keeps clear of every booked visit, on both sides", () => {
    const busy = [{ startsAt: "2026-10-13T18:00:00.000Z", endsAt: "2026-10-13T19:00:00.000Z" }]; // 11:00 to 12:00
    const times = openDays({ clinic, durationMinutes: 60, from: "2026-10-13", now: monday, busy })[0].slots.map((s) => s.time);
    expect(times).toContain("10:00");
    expect(times).not.toContain("10:30");
    expect(times).not.toContain("11:00");
    expect(times).not.toContain("11:30");
    expect(times).toContain("12:00");
  });

  it("never offers a time that has already passed", () => {
    const lunch = new Date("2026-10-13T19:10:00Z"); // Tuesday 12:10
    const first = openDays({ clinic, durationMinutes: 45, from: "2026-10-13", now: lunch, busy: [] })[0];
    expect(first.slots[0].time).toBe("12:30");
  });

  it("follows the clinic's clock across the change from daylight saving time", () => {
    const days = openDays({ clinic, durationMinutes: 60, from: "2026-11-03", now: monday, busy: [] });
    expect(days[0].slots[0].startsAt).toBe("2026-11-03T18:00:00.000Z"); // 10:00 PST
  });

  it("leaves out the run-up to the client's event, and the day itself", () => {
    const blocked = eventBlock("2026-10-30", 14);
    expect(blocked("2026-10-16")).toBe(false);
    expect(blocked("2026-10-17")).toBe(true);
    expect(blocked("2026-10-30")).toBe(true);
    expect(blocked("2026-10-31")).toBe(false);
    expect(eventBlock("2026-10-30", 0)("2026-10-30")).toBe(false);
    const days = openDays({ clinic, durationMinutes: 60, from: "2026-10-13", now: monday, busy: [], blocked, maxDays: 30 });
    expect(days.some((d) => d.date >= "2026-10-17" && d.date <= "2026-10-30")).toBe(false);
    expect(days.some((d) => d.date === "2026-10-31")).toBe(true);
  });

  it("only accepts a time it offered", () => {
    const days = openDays({ clinic, durationMinutes: 60, from: "2026-10-13", now: monday, busy: [] });
    expect(isOpen(days, "2026-10-13T17:00:00.000Z")).toBe(true);
    expect(isOpen(days, "2026-10-13T17:10:00.000Z")).toBe(false);
    expect(isOpen(days, "2026-10-12T17:00:00.000Z")).toBe(false);
  });
});

describe("what a client books next (DECISIONS D-065)", () => {
  const base = { treatments: SEED_TREATMENTS, now: monday, today: "2026-10-12", timeZone: clinic.timezone };
  const suggested = {
    timeline: [
      { kind: "session", date: "2026-10-15", treatment: microneedling, session: 1, of: 3, first: true },
      { kind: "progress", date: "2026-12-30" },
    ],
  } as unknown as Plan;
  const plan = (items: { id: string; treatment: Treatment; quantity: number; targetDate?: string }[]): PlanWithItems => ({
    id: "plan",
    clientId: "client",
    scanId: null,
    status: "confirmed",
    confirmedBy: null,
    confirmedAt: monday.toISOString(),
    totalCents: 0,
    createdAt: monday.toISOString(),
    items: items.map((i, position) => ({
      id: i.id,
      planId: "plan",
      treatmentId: i.treatment.id,
      productId: null,
      quantity: i.quantity,
      unitPriceCents: i.treatment.priceCents,
      position,
      targetDate: i.targetDate ?? null,
    })),
  });

  it("without a plan, offers the first session of the plan the report suggests, from tomorrow", () => {
    const { upcoming, target } = nextBooking({ ...base, plan: null, suggested, appointments: [] });
    expect(upcoming).toBeNull();
    expect(target).toMatchObject({ treatment: { id: microneedling.id }, reason: "first", session: 1, of: 3, planItemId: null, earliest: "2026-10-13" });
  });

  it("with a visit coming up, shows it instead of offering another", () => {
    const booked = visit({ startsAt: "2026-10-20T18:00:00.000Z", endsAt: "2026-10-20T19:00:00.000Z" });
    const { upcoming, target } = nextBooking({ ...base, plan: null, suggested, appointments: [booked] });
    expect(upcoming?.id).toBe(booked.id);
    expect(target).toBeNull();
  });

  it("in a course, offers the session due soonest, no earlier than its interval allows", () => {
    const done = visit({ planItemId: "a", status: "completed", startsAt: "2026-09-22T18:00:00.000Z", endsAt: "2026-09-22T19:00:00.000Z" });
    const p = plan([
      { id: "a", treatment: microneedling, quantity: 3 },
      { id: "b", treatment: peel, quantity: 3, targetDate: "2026-11-02" },
    ]);
    const { target } = nextBooking({ ...base, plan: p, suggested: null, appointments: [done] });
    // September 22 plus 28 days.
    expect(target).toMatchObject({ treatment: { id: microneedling.id }, reason: "next", session: 2, of: 3, planItemId: "a", earliest: "2026-10-20" });
  });

  it("offers a missed session again: a visit that passed without being done doesn't count", () => {
    const missed = visit({ planItemId: "a", status: "booked", startsAt: "2026-10-01T18:00:00.000Z", endsAt: "2026-10-01T19:00:00.000Z" });
    const { upcoming, target } = nextBooking({ ...base, plan: plan([{ id: "a", treatment: microneedling, quantity: 3 }]), suggested: null, appointments: [missed] });
    expect(upcoming).toBeNull();
    expect(target).toMatchObject({ session: 1, planItemId: "a", earliest: "2026-10-13" });
  });

  it("once the course is complete, offers a maintenance visit", () => {
    const done = [1, 2, 3].map((n) => visit({ planItemId: "a", status: "completed", startsAt: `2026-0${6 + n}-07T18:00:00.000Z`, endsAt: `2026-0${6 + n}-07T19:00:00.000Z` }));
    const { target } = nextBooking({ ...base, plan: plan([{ id: "a", treatment: microneedling, quantity: 3 }]), suggested: null, appointments: done });
    expect(target).toMatchObject({ treatment: { id: microneedling.id }, reason: "maintenance", session: null, planItemId: null, earliest: "2026-10-13" });
  });
});

describe("booking in the store (one treatment room, DECISIONS D-049)", () => {
  let store: typeof import("@/lib/store/local").localStore;
  let SlotTakenError: typeof import("@/lib/store/types").SlotTakenError;
  beforeAll(async () => {
    store = (await import("@/lib/store/local")).localStore;
    SlotTakenError = (await import("@/lib/store/types")).SlotTakenError;
  });

  it("refuses a second visit over the same time, in the same sandbox only", async () => {
    await store.addAppointment(visit({ sandboxId: "room-a" }));
    await expect(store.addAppointment(visit({ sandboxId: "room-a", startsAt: "2026-10-13T18:30:00.000Z", endsAt: "2026-10-13T19:30:00.000Z" }))).rejects.toBeInstanceOf(SlotTakenError);
    await expect(store.addAppointment(visit({ sandboxId: "room-b" }))).resolves.toBeTruthy();
    // Back to back is fine.
    await expect(store.addAppointment(visit({ sandboxId: "room-a", startsAt: "2026-10-13T19:00:00.000Z", endsAt: "2026-10-13T20:00:00.000Z" }))).resolves.toBeTruthy();
  });

  it("settles a deposit exactly once, even when the return page and the webhook race", async () => {
    const held = await store.addAppointment(visit({ sandboxId: "room-c", depositCents: 5000, depositStatus: "pending" }));
    const settle = () => store.transitionAppointment(held.id, { status: ["booked"], depositStatus: ["pending"] }, { depositStatus: "paid", depositPaymentIntent: "pi_1" });
    const [a, b] = await Promise.all([settle(), settle()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((await store.getAppointment(held.id))?.depositStatus).toBe("paid");
  });

  it("frees a cancelled time, and won't bring a visit back over one booked since", async () => {
    const first = await store.addAppointment(visit({ sandboxId: "room-d", depositStatus: "pending" }));
    await store.transitionAppointment(first.id, { status: ["booked"], depositStatus: ["pending"] }, { status: "cancelled" });
    await store.addAppointment(visit({ sandboxId: "room-d" }));
    await expect(
      store.transitionAppointment(first.id, { status: ["cancelled"], depositStatus: ["pending"] }, { status: "booked", depositStatus: "paid" }),
    ).rejects.toBeInstanceOf(SlotTakenError);
  });
});

describe("the booking emails (DECISIONS D-065)", () => {
  const details = {
    clinic,
    firstName: "Sofia",
    treatmentName: "Microneedling",
    startsAt: "2026-10-14T18:00:00.000Z",
    endsAt: "2026-10-14T19:00:00.000Z",
    depositCents: 5000,
    reportUrl: "https://rebloom.test/r/abcdefghijklmnopqrstuvwx",
    noticeHours: 24,
  };

  it("confirms the visit in the clinic's time, with the deposit, the way to cancel, and the report button", () => {
    expect(visitWhen(details.startsAt, clinic.timezone)).toBe("Wednesday, October 14 at 11:00 AM");
    const mail = bookingConfirmationEmail(details);
    expect(mail.subject).toBe("You're booked, Sofia");
    expect(mail.text).toContain("Microneedling on Wednesday, October 14 at 11:00 AM");
    expect(mail.text).toContain("about 60 minutes");
    expect(mail.text).toContain("$50 deposit is paid");
    expect(mail.text).toContain("up to 24 hours before");
    expect(mail.html).toContain(`href="${details.reportUrl}"`);
    expect(mail.html).toContain("Open your report");
    expect(checkCopy(`${mail.subject}\n${mail.text}`)).toEqual([]);
  });

  it("never mentions a deposit that wasn't taken", () => {
    const mail = bookingConfirmationEmail({ ...details, depositCents: 0 });
    expect(mail.text).not.toContain("deposit");
  });

  it("says when a cancelled visit's deposit is on its way back", () => {
    const mail = bookingCancelledEmail({ ...details, refunded: true });
    expect(mail.text).toContain("Your visit for Microneedling on Wednesday, October 14 at 11:00 AM is cancelled.");
    expect(mail.text).toContain("$50 deposit is on its way back");
    expect(bookingCancelledEmail({ ...details, refunded: false }).text).not.toContain("deposit");
    expect(checkCopy(mail.text)).toEqual([]);
  });

  it("attaches a calendar invite any calendar can read", () => {
    const ics = visitInvite({ uid: "abc", clinic, treatmentName: "Microneedling", startsAt: details.startsAt, endsAt: details.endsAt, reportUrl: details.reportUrl, now: monday });
    expect(ics).toContain("DTSTART:20261014T180000Z\r\n");
    expect(ics).toContain("DTEND:20261014T190000Z\r\n");
    expect(ics).toContain("UID:abc@rebloom");
    expect(ics).toContain("LOCATION:1200 Montana Avenue\\, Santa Monica\\, CA");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(visitInvite({ uid: "abc", clinic, treatmentName: "Microneedling", startsAt: details.startsAt, endsAt: details.endsAt, reportUrl: details.reportUrl, now: monday, cancelled: true })).toContain("STATUS:CANCELLED");
  });
});

describe("what the booking page says (DECISIONS D-065)", () => {
  it("names the visit, its cost, and why the first day offered is that day, in the clinic's voice", async () => {
    const { bookingWords } = await import("@/lib/booking/words");
    const first = bookingWords({
      target: { treatment: peel, reason: "first", session: 1, of: 3, planItemId: null, earliest: "2026-10-13" },
      clinic,
      intake: null,
      today: "2026-10-12",
    });
    expect(first).toMatchObject({ kicker: "Book · Session 1 of 3", title: "Consultation and Signature Peel Series.", cta: "Book your first session", why: null });
    expect(first.facts).toBe("45 minutes · $195 · Maison Verre, Santa Monica");

    const next = bookingWords({
      target: { treatment: microneedling, reason: "next", session: 2, of: 3, planItemId: "a", earliest: "2026-10-20" },
      clinic,
      intake: { hasEvent: true, eventType: "wedding", eventDate: "2026-11-14" } as never,
      today: "2026-10-12",
    });
    expect(next.title).toBe("Microneedling, session 2.");
    expect(next.cta).toBe("Book session 2 of 3");
    expect(next.why).toBe("Your skin needs at least 28 days between sessions, so the first day we offer is Tuesday, October 20.");
    expect(next.eventNote).toBe("To keep your skin settled for your wedding, we don't offer this treatment from November 1 to November 14.");

    const keep = bookingWords({ target: { treatment: microneedling, reason: "maintenance", session: null, of: null, planItemId: null, earliest: "2026-10-13" }, clinic, intake: null, today: "2026-10-12" });
    expect(keep.cta).toBe("Book a maintenance visit");
    for (const w of [first, next, keep]) expect(checkCopy(Object.values(w).filter(Boolean).join("\n"))).toEqual([]);
  });
});
