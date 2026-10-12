import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import { zonedDateTime } from "@/lib/clock";
import { computeInsights } from "@/lib/dashboard/insights";
import { clientRows, relativeDay, shortName, visitsOn } from "@/lib/dashboard/view";
import { buildDemoBundle } from "@/lib/demo/seed";
import type { Message } from "@/lib/domain";
import { buildQueue, clientFacts, type EngineInput } from "@/lib/rebook/engine";

process.env.REBLOOM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "rebloom-dashboard-test-"));

const TODAY = "2026-12-29";
const treatments = SEED_TREATMENTS.filter((t) => t.clinicId === MAISON_VERRE.id);
const products = SEED_PRODUCTS.filter((p) => p.clinicId === MAISON_VERRE.id);
const bundle = () => buildDemoBundle({ clinic: MAISON_VERRE, treatments, products, staff: SEED_STAFF, sandboxId: "dash", today: TODAY });

describe("the local store's dashboard methods", () => {
  let store: typeof import("@/lib/store/local").localStore;
  beforeAll(async () => {
    store = (await import("@/lib/store/local")).localStore;
    await store.createSandbox("dash", new Date(`${TODAY}T18:00:00Z`));
    await store.seedDemoClients(MAISON_VERRE.id, "dash", bundle());
  });

  it("reads one sandbox's records in one round, and nothing from another", async () => {
    const records = await store.listClinicRecords(MAISON_VERRE.id, "dash");
    expect(records.clients).toHaveLength(12);
    expect(records.scans.length).toBeGreaterThan(12);
    expect(records.plans.every((p) => p.items.length > 0)).toBe(true);
    expect((await store.listClinicRecords(MAISON_VERRE.id, "elsewhere")).clients).toEqual([]);
  });

  it("adds a message to the outbox once per dedupe key", async () => {
    const [client] = await store.listClients(MAISON_VERRE.id, "dash");
    const message: Omit<Message, "id"> = {
      clinicId: MAISON_VERRE.id,
      clientId: client.id,
      sandboxId: "dash",
      type: "report_follow_up",
      channel: "email",
      subject: "Your skin report",
      body: "Hi",
      status: "sent",
      dedupeKey: "report_follow_up",
      scheduledFor: null,
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    expect(await store.addMessage(message)).not.toBeNull();
    expect(await store.addMessage(message)).toBeNull();
  });

  it("confirms a proposed plan once, and keeps one live plan per client", async () => {
    const olivia = (await store.listClients(MAISON_VERRE.id, "dash")).find((c) => c.demoKey === "olivia")!;
    const [plan] = await store.listPlans(olivia.id);
    expect(plan.status).toBe("proposed");
    const now = new Date();
    expect((await store.confirmPlan(plan.id, SEED_STAFF[0].id, now))?.status).toBe("confirmed");
    expect(await store.confirmPlan(plan.id, SEED_STAFF[0].id, now)).toBeNull();
    const again = { ...plan, id: "another", status: "confirmed" as const, confirmedAt: now.toISOString() };
    expect(await store.createPlan(again, [])).toBeNull();
  });

  it("saves and clears the practitioner's note", async () => {
    const priya = (await store.listClients(MAISON_VERRE.id, "dash")).find((c) => c.demoKey === "priya")!;
    expect((await store.setPractitionerNote(priya.id, "See you soon.")).practitionerNote).toBe("See you soon.");
    expect((await store.setPractitionerNote(priya.id, null)).practitionerNote).toBeNull();
  });
});

describe("what the dashboard shows", () => {
  const b = bundle();
  const input: EngineInput = {
    clinic: MAISON_VERRE,
    practitionerName: "Dana",
    now: zonedDateTime(TODAY, "09:30", MAISON_VERRE.timezone),
    reportUrl: (t) => `/r/${t}`,
    treatments,
    products,
    ...b,
    plans: b.plans.map((p) => ({ ...p, items: b.planItems.filter((i) => i.planId === p.id) })),
  };
  const facts = clientFacts(input);
  const queue = buildQueue(input);

  it("flags at-risk clients on the client list, whatever their stored status", () => {
    const rows = clientRows(facts, queue, input.now, MAISON_VERRE.timezone);
    const status = (key: string) => rows.find((r) => r.facts.client.demoKey === key)!.status;
    expect(status("grace")).toBe("at_risk");
    expect(status("daniel")).toBe("at_risk");
    expect(status("chloe")).toBe("lapsed");
    expect(status("amelia")).toBe("course_complete");
    const amelia = rows.find((r) => r.facts.client.demoKey === "amelia")!;
    expect(amelia.trend?.label).toBe("Texture");
    expect(amelia.trend?.delta).toBeGreaterThan(0);
  });

  it("lists a day's visits in time order, with the session number", () => {
    const tuesday = visitsOn("2026-12-29", facts, treatments, MAISON_VERRE.timezone);
    expect(tuesday.map((v) => v.appointment.startsAt)).toEqual([...tuesday.map((v) => v.appointment.startsAt)].sort());
    // US time, with am or pm.
    for (const v of tuesday) expect(v.time).toMatch(/^(1[0-2]|[1-9]):[0-5]\d[ap]m$/);
    const led = tuesday.find((v) => v.facts.client.demoKey === "hannah");
    expect(led?.session).toBe("Session 4 of 6");
  });

  it("counts revenue kept only from second and later visits, and every rate from the rows", () => {
    const prices = new Map(treatments.map((t) => [t.id, t.priceCents]));
    const insights = computeInsights(facts, {
      today: TODAY,
      timeZone: MAISON_VERRE.timezone,
      atRiskIds: new Set(queue.items.filter((i) => i.atRisk).map((i) => i.clientId)),
      treatmentPrice: (id) => prices.get(id) ?? 0,
    });
    expect(insights.months).toHaveLength(6);
    expect(insights.months.at(-1)!.month).toBe("2026-12");
    expect(insights.keptCents).toBe(insights.months.reduce((n, m) => n + m.cents, 0));
    expect(insights.keptCents).toBeGreaterThan(0);
    expect(insights.atRisk).toBe(3);
    expect(insights.reportsToBookings.of).toBe(12);
    expect(insights.rebook.rate).toBeGreaterThan(0);
    expect(insights.rebook.rate).toBeLessThanOrEqual(1);
  });

  it("speaks plainly about names and days", () => {
    expect(shortName({ firstName: "Amelia", lastName: "Reyes" })).toBe("Amelia R.");
    expect(relativeDay("2026-12-30", TODAY)).toBe("Tomorrow");
    expect(relativeDay("2026-12-26", TODAY)).toBe("3 days ago");
  });
});
