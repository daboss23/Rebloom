import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { MAISON_VERRE, TIDEWATER } from "@/data/clinics";
import { DEMO_CLIENTS } from "@/data/demo-clients";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import type { Clinic, Scan } from "@/lib/domain";
import { isoDateInZone, zonedDateTime } from "@/lib/clock";
import { checkCopy } from "@/lib/copy/check";
import { buildDemoBundle, type DemoBundle } from "@/lib/demo/seed";
import { rankPriorities, shiftDate, statedConcerns } from "@/lib/plan/build";
import {
  MISSED_AFTER_DAYS,
  PROGRESS_MOMENT_RAW_DELTA,
  REPORT_FOLLOW_UP_DAYS,
  STALLED_RAW_DELTA,
} from "@/lib/rebook/thresholds";
import { scanStoragePaths, SHARED_DEMO_PREFIX } from "@/lib/store/scan-paths";

process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-demo-test-"));

const DAY_MS = 86_400_000;

function bundleFor(today: string, clinic: Clinic = MAISON_VERRE, sandboxId = "sandbox"): DemoBundle {
  return buildDemoBundle({
    clinic,
    treatments: SEED_TREATMENTS.filter((t) => t.clinicId === clinic.id),
    products: SEED_PRODUCTS.filter((p) => p.clinicId === clinic.id),
    staff: SEED_STAFF,
    sandboxId,
    today,
  });
}

/** One client's slice of a bundle, by demo key. */
function storyOf(bundle: DemoBundle, key: string) {
  const client = bundle.clients.find((c) => c.demoKey === key)!;
  const mine = <T extends { clientId: string }>(rows: T[]) => rows.filter((r) => r.clientId === client.id);
  const plan = mine(bundle.plans)[0] ?? null;
  return {
    client,
    intake: mine(bundle.intakes)[0],
    scans: mine(bundle.scans),
    report: mine(bundle.reports)[0],
    plan,
    items: plan ? bundle.planItems.filter((i) => i.planId === plan.id) : [],
    appointments: mine(bundle.appointments).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    messages: mine(bundle.messages),
  };
}

const local = (instant: string, clinic: Clinic = MAISON_VERRE) => isoDateInZone(new Date(instant), clinic.timezone);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
const raw = (scan: Scan, key: string) => scan.result!.concerns.find((c) => c.key === key)!.raw;

// A full week, both daylight saving changes, and the mockup's day (DECISIONS D-016: DEMO_TODAY=2026-12-29).
const TODAYS = [
  "2026-12-29",
  "2026-12-30",
  "2026-12-31",
  "2027-01-01",
  "2027-01-02",
  "2027-01-03",
  "2027-01-04",
  "2026-11-02",
  "2027-03-15",
  "2026-10-06",
];

describe("the demo cast", () => {
  it("has twelve clients, five starring, covering every status", () => {
    expect(DEMO_CLIENTS).toHaveLength(12);
    expect(DEMO_CLIENTS.filter((c) => c.starring).map((c) => c.key)).toEqual(["amelia", "priya", "marcus", "sofia", "grace"]);
    expect(new Set(DEMO_CLIENTS.map((c) => c.status))).toEqual(
      new Set(["lead", "booked", "in_course", "course_complete", "at_risk", "lapsed"]),
    );
    expect(new Set(DEMO_CLIENTS.map((c) => c.key)).size).toBe(12);
  });

  it("follows the copy rules in everything a client or practitioner reads", () => {
    const bundle = bundleFor("2026-12-29");
    const texts = [
      ...DEMO_CLIENTS.flatMap((c) => [c.note, c.intake.goalText].filter((t): t is string => Boolean(t))),
      ...bundle.messages.flatMap((m) => [m.subject ?? "", m.body]),
    ];
    for (const text of texts) expect(checkCopy(text), text).toEqual([]);
  });
});

describe.each(TODAYS)("a sandbox whose today is %s", (today) => {
  const bundle = bundleFor(today);

  it("books every visit on an open day, inside opening hours, on the slot grid, with no overlaps", () => {
    const { hours, timezone } = MAISON_VERRE;
    const clock = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    for (const a of bundle.appointments) {
      const date = local(a.startsAt);
      const open = hours.days[new Date(`${date}T12:00:00Z`).getUTCDay() as 0];
      expect(open, `${a.startsAt} is on a closed day`).toBeDefined();
      const [start, end] = [clock.format(new Date(a.startsAt)), clock.format(new Date(a.endsAt))];
      expect(start >= open!.open && end <= open!.close, `${start} to ${end}`).toBe(true);
      expect(Number(start.slice(3)) % hours.slotMinutes).toBe(0);
    }
    const sorted = [...bundle.appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].startsAt >= sorted[i - 1].endsAt).toBe(true);
  });

  it("marks past visits completed and today's and later ones booked, each booked before it happens", () => {
    for (const a of bundle.appointments) {
      expect(a.status).toBe(local(a.startsAt) < today ? "completed" : "booked");
      expect(a.createdAt < a.startsAt).toBe(true);
      expect(local(a.createdAt) <= today).toBe(true);
    }
    for (const m of bundle.messages) expect(local(m.sentAt!) <= today).toBe(true);
  });

  it("never has a visit before the client's first scan, or a planned one before the plan", () => {
    for (const client of bundle.clients) {
      const story = storyOf(bundle, client.demoKey!);
      for (const a of story.appointments) {
        expect(a.startsAt > story.scans[0].completedAt!).toBe(true);
        if (a.planItemId) expect(a.startsAt > story.plan!.createdAt).toBe(true);
      }
      if (story.plan) expect(story.plan.createdAt > story.scans[0].completedAt!).toBe(true);
    }
  });

  it("keeps each course's visits within its treatment's interval", () => {
    for (const client of bundle.clients) {
      const planned = storyOf(bundle, client.demoKey!).appointments.filter((a) => a.planItemId);
      for (let i = 1; i < planned.length; i++) {
        if (planned[i].treatmentId !== planned[i - 1].treatmentId) continue;
        const t = SEED_TREATMENTS.find((t) => t.id === planned[i].treatmentId)!;
        const gap = daysBetween(local(planned[i - 1].startsAt), local(planned[i].startsAt));
        // Snapping to an open day can move a visit up to two days either way.
        expect(gap, `${client.firstName}: ${gap} days`).toBeGreaterThanOrEqual(t.intervalDaysMin - 2);
        expect(gap, `${client.firstName}: ${gap} days`).toBeLessThanOrEqual(t.intervalDaysMax + 4);
      }
    }
  });

  it("takes one deposit per client, on their first visit", () => {
    for (const client of bundle.clients) {
      const paid = storyOf(bundle, client.demoKey!).appointments.map((a) => a.depositStatus);
      if (paid.length > 0) expect(paid).toEqual(["paid", ...paid.slice(1).map(() => "none")]);
    }
  });

  it("prices every plan from its items, and links planned visits to them", () => {
    for (const plan of bundle.plans) {
      const items = bundle.planItems.filter((i) => i.planId === plan.id);
      expect(plan.totalCents).toBe(items.reduce((n, i) => n + i.quantity * i.unitPriceCents, 0));
    }
    const itemIds = new Set(bundle.planItems.map((i) => i.id));
    for (const a of bundle.appointments) if (a.planItemId) expect(itemIds.has(a.planItemId)).toBe(true);
  });

  it("tells Amelia's story: course complete, real progress, one facial before the wedding", () => {
    const amelia = storyOf(bundle, "amelia");
    const treatments = amelia.items.filter((i) => i.treatmentId).reduce((n, i) => n + i.quantity * i.unitPriceCents, 0);
    // Treatments $980, $1,090 with home care (DECISIONS D-005).
    expect(treatments).toBe(98_000);
    expect(amelia.plan!.totalCents).toBe(109_000);
    const [first, last] = [amelia.scans[0], amelia.scans[amelia.scans.length - 1]];
    expect(raw(last, "texture") - raw(first, "texture")).toBeGreaterThanOrEqual(PROGRESS_MOMENT_RAW_DELTA);
    const facial = amelia.appointments[amelia.appointments.length - 1];
    expect(facial.status).toBe("booked");
    const wedding = amelia.intake.eventDate!;
    expect(daysBetween(local(facial.startsAt), wedding)).toBeGreaterThanOrEqual(3);
    expect(amelia.appointments.filter((a) => a.planItemId).every((a) => a.status === "completed")).toBe(true);
  });

  it("gives Priya a report old enough for the follow-up, and Isabel one that isn't yet", () => {
    const priya = storyOf(bundle, "priya");
    expect(daysBetween(local(priya.scans[0].completedAt!), today)).toBeGreaterThanOrEqual(REPORT_FOLLOW_UP_DAYS);
    expect(priya.appointments).toEqual([]);
    const isabel = storyOf(bundle, "isabel");
    expect(daysBetween(local(isabel.scans[0].completedAt!), today)).toBeLessThan(REPORT_FOLLOW_UP_DAYS);
    expect(isabel.appointments).toEqual([]);
  });

  it("books Marcus's first consult for the next open day, deposit paid", () => {
    const [consult] = storyOf(bundle, "marcus").appointments;
    expect(consult.kind).toBe("consult");
    expect(consult.status).toBe("booked");
    expect(consult.depositStatus).toBe("paid");
    expect(daysBetween(today, local(consult.startsAt))).toBeLessThanOrEqual(2);
  });

  it("gives Sofia a progress moment and an unbooked next session", () => {
    const sofia = storyOf(bundle, "sofia");
    const stated = statedConcerns(sofia.intake);
    const [before, after] = sofia.scans;
    const priorities = rankPriorities(before.result!, stated).map((c) => c.key);
    expect(Math.max(...priorities.map((k) => raw(after, k) - raw(before, k)))).toBeGreaterThanOrEqual(PROGRESS_MOMENT_RAW_DELTA);
    expect(sofia.appointments.every((a) => a.status === "completed")).toBe(true);
    expect(sofia.appointments.filter((a) => a.planItemId)).toHaveLength(2);
  });

  it("stalls Grace: two rescans in a row with almost no change on her priorities", () => {
    const grace = storyOf(bundle, "grace");
    const priorities = rankPriorities(grace.scans[0].result!, statedConcerns(grace.intake)).map((k) => k.key);
    expect(priorities).toContain("age_spot");
    for (let i = 1; i < grace.scans.length; i++) {
      for (const k of priorities) expect(Math.abs(raw(grace.scans[i], k) - raw(grace.scans[i - 1], k))).toBeLessThan(STALLED_RAW_DELTA);
    }
    expect(grace.scans).toHaveLength(3);
    // Her third session is coming up, so Dana sees the flag in time to adjust.
    const next = grace.appointments.find((a) => a.status === "booked")!;
    expect(daysBetween(today, local(next.startsAt))).toBeLessThanOrEqual(3);
  });

  it("leaves Daniel's second peel overdue long enough to count as missed", () => {
    const daniel = storyOf(bundle, "daniel");
    const peel = SEED_TREATMENTS.find((t) => t.name === "Signature Peel Series")!;
    const due = shiftDate(local(daniel.appointments[0].startsAt), peel.intervalDaysMax);
    expect(daysBetween(due, today)).toBeGreaterThanOrEqual(MISSED_AFTER_DAYS);
    expect(daniel.appointments).toHaveLength(1);
  });

  it("makes Rachel's progress scan due and Nina's maintenance due", () => {
    const rachel = storyOf(bundle, "rachel");
    expect(daysBetween(local(rachel.appointments[2].startsAt), today)).toBeGreaterThanOrEqual(14);
    expect(rachel.scans).toHaveLength(1);
    const nina = storyOf(bundle, "nina");
    const peel = SEED_TREATMENTS.find((t) => t.name === "Signature Peel Series")!;
    expect(daysBetween(local(nina.appointments[2].startsAt), today)).toBeGreaterThanOrEqual(peel.maintenanceIntervalDays!);
  });

  it("keeps Chloe off the email list", () => {
    const chloe = storyOf(bundle, "chloe");
    expect(bundle.consents.filter((c) => c.clientId === chloe.client.id).map((c) => c.type)).toEqual(["biometric"]);
  });
});

describe("a demo copy", () => {
  it("lands on the mockup's dates when today is December 29, 2026", () => {
    const amelia = storyOf(bundleFor("2026-12-29"), "amelia");
    expect(amelia.scans.map((s) => local(s.createdAt))).toEqual(["2026-10-05", "2026-11-02", "2026-11-23", "2026-12-28"]);
    expect(amelia.intake.eventDate).toBe("2027-01-11");
    expect(local(amelia.appointments[amelia.appointments.length - 1].startsAt)).toBe("2027-01-05");
    expect(amelia.scans[0].result!.concerns.find((c) => c.key === "texture")!.ui).toBe(58);
    expect(amelia.scans[3].result!.concerns.find((c) => c.key === "texture")!.ui).toBe(71);
  });

  it("never emails a real inbox, and points every photo at the shared portraits", () => {
    const bundle = bundleFor("2026-12-29");
    for (const c of bundle.clients) expect(c.email).toMatch(/@example\.com$/);
    for (const s of bundle.scans) expect(s.imagePath.startsWith(SHARED_DEMO_PREFIX)).toBe(true);
    // Deleting a sandbox's copy must not delete the portraits everyone shares.
    expect(scanStoragePaths(bundle.scans)).toEqual([]);
  });

  it("works for the second clinic, in its own time zone", () => {
    const bundle = bundleFor("2026-12-29", TIDEWATER);
    expect(bundle.clients.every((c) => c.clinicId === TIDEWATER.id)).toBe(true);
    expect(bundle.appointments.every((a) => a.staffId === SEED_STAFF.find((s) => s.name === "Maya")!.id)).toBe(true);
    const amelia = storyOf(bundle, "amelia");
    expect(local(amelia.appointments[0].startsAt, TIDEWATER)).toBe("2026-10-13");
  });

  it("gives every copy fresh ids and report tokens", () => {
    const [a, b] = [bundleFor("2026-12-29", MAISON_VERRE, "one"), bundleFor("2026-12-29", MAISON_VERRE, "two")];
    expect(a.clients[0].id).not.toBe(b.clients[0].id);
    expect(a.reports[0].token).not.toBe(b.reports[0].token);
    expect(new Set(a.reports.map((r) => r.token)).size).toBe(12);
  });
});

describe("zonedDateTime", () => {
  it("turns a clinic's wall-clock time into the right instant, either side of daylight saving", () => {
    expect(zonedDateTime("2026-10-13", "10:30", "America/Los_Angeles").toISOString()).toBe("2026-10-13T17:30:00.000Z");
    expect(zonedDateTime("2026-11-03", "10:30", "America/Los_Angeles").toISOString()).toBe("2026-11-03T18:30:00.000Z");
    expect(zonedDateTime("2026-03-08", "10:00", "America/Los_Angeles").toISOString()).toBe("2026-03-08T17:00:00.000Z");
    expect(zonedDateTime("2026-11-01", "00:30", "America/Los_Angeles").toISOString()).toBe("2026-11-01T07:30:00.000Z");
    expect(zonedDateTime("2026-12-29", "15:00", "America/New_York").toISOString()).toBe("2026-12-29T20:00:00.000Z");
  });
});

describe("the local store's demo copies", () => {
  let store: typeof import("@/lib/store/local").localStore;
  beforeAll(async () => {
    store = (await import("@/lib/store/local")).localStore;
  });

  it("copies once per sandbox, even when two requests race", async () => {
    await store.createSandbox("race", new Date("2026-12-29T18:00:00Z"));
    const results = await Promise.all([
      store.seedDemoClients(MAISON_VERRE.id, "race", bundleFor("2026-12-29", MAISON_VERRE, "race")),
      store.seedDemoClients(MAISON_VERRE.id, "race", bundleFor("2026-12-29", MAISON_VERRE, "race")),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.listClients(MAISON_VERRE.id, "race")).toHaveLength(12);
    // Another clinic in the same sandbox gets its own copy.
    expect(await store.seedDemoClients(TIDEWATER.id, "race", bundleFor("2026-12-29", TIDEWATER, "race"))).toBe(true);
    expect(await store.listClients(MAISON_VERRE.id, "elsewhere")).toEqual([]);
  });

  it("reads plans with their items in order, and the clinic's appointments and outbox", async () => {
    const amelia = (await store.listClients(MAISON_VERRE.id, "race")).find((c) => c.demoKey === "amelia")!;
    const [plan] = await store.listPlans(amelia.id);
    expect(plan.items.map((i) => i.position)).toEqual([0, 1, 2, 3]);
    const appointments = await store.listAppointments(MAISON_VERRE.id, "race");
    expect(appointments.map((a) => a.startsAt)).toEqual([...appointments.map((a) => a.startsAt)].sort());
    expect((await store.listMessages(MAISON_VERRE.id, "race")).some((m) => m.type === "report_link")).toBe(true);
    expect((await store.listStaff(MAISON_VERRE.id)).map((s) => s.name)).toEqual(["Dana", "Claire"]);
  });

  it("deletes a demo client's plan, visits and messages, but never the shared portrait", async () => {
    const grace = (await store.listClients(MAISON_VERRE.id, "race")).find((c) => c.demoKey === "grace")!;
    const { storagePaths } = await store.deleteClientData(grace.id, new Date());
    expect(storagePaths).toEqual([]);
    expect(await store.listPlans(grace.id)).toEqual([]);
    expect((await store.listAppointments(MAISON_VERRE.id, "race")).some((a) => a.clientId === grace.id)).toBe(false);
    expect((await store.listMessages(MAISON_VERRE.id, "race")).some((m) => m.clientId === grace.id)).toBe(false);
  });

  it("moves the clock forward only", async () => {
    expect((await store.setClockOffset("race", 2)).clockOffsetDays).toBe(2);
    await expect(store.setClockOffset("race", 1)).rejects.toThrow("only moves forward");
  });

  it("removes every copy with its sandbox", async () => {
    await store.deleteSandboxes(["race"]);
    expect(await store.listClients(MAISON_VERRE.id, "race")).toEqual([]);
    expect(await store.listAppointments(MAISON_VERRE.id, "race")).toEqual([]);
    expect(await store.listMessages(TIDEWATER.id, "race")).toEqual([]);
  });
});

describe("bundled demo portraits (DECISIONS D-030)", () => {
  it("maps a demo portrait to the copy that ships with the app, and nothing else", async () => {
    const { bundledPortraitUrl } = await import("@/lib/store/scan-paths");
    expect(bundledPortraitUrl("demo/portraits/sofia.jpg")).toBe("/demo-portraits/sofia.jpg");
    expect(bundledPortraitUrl("scans/abc/def.jpg")).toBeNull();
    expect(bundledPortraitUrl("demo/portraits/../secret.jpg")).toBeNull();
  });
});
